import { z } from 'zod';
import { AgentTool, ToolContext, ToolResult } from './types.js';

const inputSchema = z.object({
  expression: z.string().min(1).describe('The mathematical expression to evaluate, e.g. "25 * 4 + 10"'),
});

function safeEvalMath(expr: string): number {
  const sanitized = expr.replace(/\s+/g, '');
  if (!/^[-+*/%^().0-9]+$/.test(sanitized)) {
    throw new Error('Expression contains invalid characters. Only digits and math operators are allowed.');
  }

  const tokens: (string | number)[] = [];
  let i = 0;
  while (i < sanitized.length) {
    const ch = sanitized.charAt(i);
    if ('+-*/%^()'.includes(ch)) {
      tokens.push(ch);
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < sanitized.length && /[0-9.]/.test(sanitized.charAt(i))) {
        numStr += sanitized.charAt(i);
        i++;
      }
      tokens.push(parseFloat(numStr));
    } else {
      throw new Error(`Unexpected character: ${ch}`);
    }
  }

  const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
  const outputQueue: (string | number)[] = [];
  const operatorStack: string[] = [];

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];
    if (typeof token === 'number') {
      outputQueue.push(token);
    } else if (token === '(') {
      operatorStack.push(token);
    } else if (token === ')') {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
        outputQueue.push(operatorStack.pop()!);
      }
      operatorStack.pop();
    } else if (typeof token === 'string') {
      const prev = idx > 0 ? tokens[idx - 1] : undefined;
      if (token === '-' && (idx === 0 || prev === '(' || (typeof prev === 'string' && '+-*/%^'.includes(prev)))) {
        outputQueue.push(0);
      }
      const tokenPrec = precedence[token] ?? 0;
      while (operatorStack.length > 0) {
        const top = operatorStack[operatorStack.length - 1];
        if (top && top !== '(' && (precedence[top] ?? 0) >= tokenPrec) {
          outputQueue.push(operatorStack.pop()!);
        } else {
          break;
        }
      }
      operatorStack.push(token);
    }
  }

  while (operatorStack.length > 0) {
    const op = operatorStack.pop()!;
    if (op === '(' || op === ')') throw new Error('Mismatched parentheses in expression');
    outputQueue.push(op);
  }

  const evalStack: number[] = [];
  for (const item of outputQueue) {
    if (typeof item === 'number') {
      evalStack.push(item);
    } else {
      const b = evalStack.pop();
      const a = evalStack.pop();
      if (a === undefined || b === undefined) throw new Error('Invalid math expression syntax');
      switch (item) {
        case '+': evalStack.push(a + b); break;
        case '-': evalStack.push(a - b); break;
        case '*': evalStack.push(a * b); break;
        case '/':
          if (b === 0) throw new Error('Division by zero');
          evalStack.push(a / b);
          break;
        case '%': evalStack.push(a % b); break;
        case '^': evalStack.push(Math.pow(a, b)); break;
        default: throw new Error(`Unknown operator: ${item}`);
      }
    }
  }

  const finalVal = evalStack[0];
  if (evalStack.length !== 1 || finalVal === undefined || isNaN(finalVal)) {
    throw new Error('Failed to evaluate valid numerical result');
  }

  return finalVal;
}

export const calculatorTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: 'calculator',
  description: 'Safely evaluate mathematical and arithmetic calculations without any risk of code injection.',
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, _context: ToolContext): Promise<ToolResult> {
    try {
      const result = safeEvalMath(input.expression);
      return {
        toolName: 'calculator',
        success: true,
        data: {
          expression: input.expression,
          result,
        },
      };
    } catch (err: unknown) {
      return {
        toolName: 'calculator',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
