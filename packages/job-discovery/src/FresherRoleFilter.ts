export interface JobRoleInfo {
  title: string;
  description?: string;
  experienceLevel?: string;
}

export interface FresherFilterResult {
  eligible: boolean;
  score: number;
  matchedPositive: string[];
  matchedNegative: string[];
  reason: string;
}

export class FresherRoleFilter {
  // Strong indicators of fresher / early-career roles
  private static readonly POSITIVE_PATTERNS: RegExp[] = [
    /\bfresher\b/i,
    /\bentry[\s-]?level\b/i,
    /\bjunior\b/i,
    /\bjr\.?\b/i,
    /\bgraduate\b/i,
    /\btrainee\b/i,
    /\bget\b/i, // Graduate Engineer Trainee
    /\bpget\b/i,
    /\bassociate\b/i,
    /\bintern\b/i,
    /\binternship\b/i,
    /\bcampus\b/i,
    /\bearly[\s-]?career\b/i,
    /\bnew[\s-]?grad\b/i,
    /\buniversity\b/i,
    /\bsde[\s-]?1\b/i,
    /\bsde[\s-]?i\b/i,
    /\bsoftware\sengineer[\s-]?1\b/i,
    /\bsoftware\sengineer[\s-]?i\b/i,
    /\bsoftware\sdevelopment\sengineer[\s-]?1\b/i,
    /\bsoftware\sdevelopment\sengineer[\s-]?i\b/i,
    /\bengineer[\s-]?1\b/i,
    /\bengineer[\s-]?i\b/i,
    /\bdeveloper[\s-]?1\b/i,
    /\bdeveloper[\s-]?i\b/i,
    /\b0[\s-]?1\s*years?\b/i,
    /\b0[\s-]?2\s*years?\b/i,
  ];

  // Definite disqualifiers (Senior/Leadership/High Experience)
  private static readonly NEGATIVE_PATTERNS: RegExp[] = [
    /\bsenior\b/i,
    /\bsr\.?\b/i,
    /\bstaff\b/i,
    /\bprincipal\b/i,
    /\blead\b/i,
    /\btech\s*lead\b/i,
    /\bteam\s*lead\b/i,
    /\bmanager\b/i,
    /\bdirector\b/i,
    /\bvp\b/i,
    /\bvice\s*president\b/i,
    /\bhead\s*of\b/i,
    /\barchitect\b/i,
    /\bdistinguished\b/i,
    /\b3\+\s*years\b/i,
    /\b4\+\s*years\b/i,
    /\b5\+\s*years\b/i,
    /\b6\+\s*years\b/i,
    /\b7\+\s*years\b/i,
    /\b8\+\s*years\b/i,
    /\b10\+\s*years\b/i,
  ];

  // Common baseline engineering roles that might be entry-level if not marked senior
  private static readonly NEUTRAL_TECH_PATTERNS: RegExp[] = [
    /\bsoftware\s*engineer\b/i,
    /\bsoftware\s*developer\b/i,
    /\bfrontend\b/i,
    /\bbackend\b/i,
    /\bfull[\s-]?stack\b/i,
    /\bqa\s*engineer\b/i,
    /\bdata\s*engineer\b/i,
    /\bdata\s*analyst\b/i,
    /\bapplication\s*engineer\b/i,
    /\bdevops\s*engineer\b/i,
    /\bcloud\s*engineer\b/i,
  ];

  /**
   * Evaluates whether a job posting is eligible for a fresher / early-career applicant.
   */
  static evaluate(job: JobRoleInfo): FresherFilterResult {
    const title = job.title || '';
    const desc = job.description || '';

    const matchedNegative: string[] = [];
    const matchedPositive: string[] = [];

    // 1. Check title for negative patterns (immediate disqualification)
    for (const pattern of this.NEGATIVE_PATTERNS) {
      if (pattern.test(title)) {
        matchedNegative.push(pattern.source);
      }
    }

    if (matchedNegative.length > 0) {
      return {
        eligible: false,
        score: 0,
        matchedPositive: [],
        matchedNegative,
        reason: `Title contains senior or leadership keywords: ${matchedNegative.join(', ')}`,
      };
    }

    // 2. Check title for positive fresher patterns
    for (const pattern of this.POSITIVE_PATTERNS) {
      if (pattern.test(title)) {
        matchedPositive.push(pattern.source);
      }
    }

    if (matchedPositive.length > 0) {
      return {
        eligible: true,
        score: 95,
        matchedPositive,
        matchedNegative: [],
        reason: `Explicit early career title matched: ${matchedPositive.join(', ')}`,
      };
    }

    // 3. Check for neutral tech roles (e.g. "Software Engineer" without senior tags)
    const isNeutralTech = this.NEUTRAL_TECH_PATTERNS.some((p) => p.test(title));
    if (isNeutralTech) {
      // Check description for high experience requirements
      const highExpInDesc = this.NEGATIVE_PATTERNS.some((p) => p.test(desc));
      if (highExpInDesc) {
        return {
          eligible: false,
          score: 20,
          matchedPositive: [],
          matchedNegative: ['high_exp_in_description'],
          reason: 'Job description requires senior-level experience',
        };
      }

      // Check description for early-career clues
      const earlyCareerInDesc = this.POSITIVE_PATTERNS.some((p) => p.test(desc));
      if (earlyCareerInDesc) {
        return {
          eligible: true,
          score: 85,
          matchedPositive: ['early_career_in_description'],
          matchedNegative: [],
          reason: 'General tech title with early-career keywords in description',
        };
      }

      // Default baseline: candidate can apply if no senior criteria found
      return {
        eligible: true,
        score: 65,
        matchedPositive: ['standard_entry_tech_title'],
        matchedNegative: [],
        reason: 'General software role with no senior disqualifiers found',
      };
    }

    return {
      eligible: false,
      score: 10,
      matchedPositive: [],
      matchedNegative: ['non_tech_or_unmatched'],
      reason: 'Role does not match fresher or standard engineering patterns',
    };
  }
}
