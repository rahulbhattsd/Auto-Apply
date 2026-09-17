import { defaultToolRegistry } from './registry.js';
import { calculatorTool } from './calculator.js';
import { datetimeTool } from './datetime.js';
import { textUtilsTool } from './text.js';
import { jsonUtilsTool } from './json.js';
import { codeHelperTool } from './code.js';
import { memorySearchTool } from './memory.js';
import { profileLookupTool } from './profile.js';
import { conversationSearchTool } from './conversation.js';
import { webResearchTool } from './research.js';

// Register standard tools
defaultToolRegistry.register(calculatorTool);
defaultToolRegistry.register(datetimeTool);
defaultToolRegistry.register(textUtilsTool);
defaultToolRegistry.register(jsonUtilsTool);
defaultToolRegistry.register(codeHelperTool);
defaultToolRegistry.register(memorySearchTool);
defaultToolRegistry.register(profileLookupTool);
defaultToolRegistry.register(conversationSearchTool);
defaultToolRegistry.register(webResearchTool);

export * from './types.js';
export * from './registry.js';
export * from './calculator.js';
export * from './datetime.js';
export * from './text.js';
export * from './json.js';
export * from './code.js';
export * from './memory.js';
export * from './profile.js';
export * from './conversation.js';
export * from './research.js';
