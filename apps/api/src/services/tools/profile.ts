import { z } from 'zod';
import { AgentTool, ToolContext, ToolResult } from './types.js';
import { prisma } from '@autoapply/database';

const inputSchema = z.object({
  includePreferences: z.boolean().optional().default(true),
});

export const profileLookupTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: 'profile_lookup',
  description: "Look up the authenticated user profile, display name, bio, timezone, and custom preferences.",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const profile = await prisma.userProfile.findUnique({
        where: { userId: context.userId },
      });

      if (!profile) {
        return {
          toolName: 'profile_lookup',
          success: true,
          data: {
            profile: null,
            message: 'No profile created yet for this user.',
          },
        };
      }

      return {
        toolName: 'profile_lookup',
        success: true,
        data: {
          displayName: profile.displayName,
          bio: profile.bio,
          timezone: profile.timezone,
          preferences: input.includePreferences ? profile.preferences : undefined,
        },
      };
    } catch (err: unknown) {
      return {
        toolName: 'profile_lookup',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
