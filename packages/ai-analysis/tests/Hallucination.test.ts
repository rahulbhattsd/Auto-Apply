import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GroqProvider } from '../src/GroqProvider';

describe('GroqProvider Hallucination Defense - Resume Tailoring', () => {
  it('should not invent skills that the candidate does not have', async () => {
    const provider = new GroqProvider();

    // Mock the external client
    let providedMessages: unknown[] = [];
    (provider as any).client = {
      chat: {
        completions: {
          create: async (params: unknown) => {
            providedMessages = params.messages;
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    content: {
                      summary: "A good candidate.",
                      skills: ["React", "TypeScript", "Rust"], // The AI attempts to hallucinate "Rust"
                      experience: [],
                      education: []
                    }
                  })
                }
              }]
            };
          }
        }
      }
    };

    const candidate = {
        skills: ['React', 'TypeScript'],
        experience: {},
        education: {},
        preferredRoles: [],
        preferredLocations: []
    };

    // The job explicitly asks for Rust to tempt hallucination
    const job = {
      title: 'Rust Developer',
      company: 'CrabCorp',
      description: 'We need an expert in Rust.',
      location: null,
      remoteType: null,
      skills: ['Rust']
    };

    const result = await provider.tailorResume({ candidate, job });
    const generatedSkills = result.content["skills"] as string[];

    const originalSkills = new Set(candidate.skills.map(s => s.toLowerCase()));
    const hallucinatedSkills = generatedSkills.filter(s => !originalSkills.has(s.toLowerCase()));

    // Verify hallucination is detectable
    assert.strictEqual(hallucinatedSkills.length, 1);
    assert.strictEqual(hallucinatedSkills[0], 'Rust');

    // Verify strict instructions were sent
    const sysMsg = providedMessages.find(m => m.role === 'system');
    assert.ok(sysMsg.content.includes('NEVER invent, hallucinate, or fabricate'));
  });
});
