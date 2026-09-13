import { PageField } from '@autoapply/shared/src/browser/types.js';
import { CandidateContext, CandidateKnowledgeResolver } from './CandidateKnowledgeResolver.js';
import { QuestionClassifier } from './QuestionClassifier.js';
import { FieldMapping, ConfidenceLevel } from './types.js';

export class SemanticFieldMapper {
  private classifier: QuestionClassifier;
  private resolver: CandidateKnowledgeResolver;

  constructor() {
    this.classifier = new QuestionClassifier();
    this.resolver = new CandidateKnowledgeResolver();
  }

  async mapFields(fields: PageField[], candidate: CandidateContext): Promise<FieldMapping[]> {
    const mappings: FieldMapping[] = [];

    for (const field of fields) {
      if (field.type === 'file' && (field.name?.toLowerCase().includes('resume') || field.name?.toLowerCase().includes('cv'))) {
        mappings.push({
          fieldLocator: field.locator,
          semanticMeaning: 'FILE_RESUME',
          candidateValue: null,
          confidence: 'HIGH',
          source: 'inferred',
          action: 'upload'
        });
        continue;
      }

      if (field.disabled) continue;

      const questionContext = `Type: ${field.type}, Options: ${field.options?.join(', ')}, Name: ${field.name}`;
      const meaning = await this.classifier.classify(field.label || field.name || 'Unknown Field', questionContext);

      const resolution = this.resolver.resolve(meaning, candidate);

      let action: FieldMapping['action'] = 'fill';
      if (field.type === 'select') action = 'select';
      if (field.type === 'radio' || field.type === 'checkbox') action = 'check';

      if (meaning.startsWith('VOLUNTARY_EEO') && resolution.value) {
         // EEO handling
         action = field.type === 'select' ? 'select' : 'check';
      }

      let confidence: ConfidenceLevel = resolution.confidence;

      if (resolution.value === null && field.required) {
         confidence = 'LOW';
      }

      mappings.push({
        fieldLocator: field.locator,
        semanticMeaning: meaning,
        candidateValue: resolution.value,
        confidence,
        source: resolution.source,
        action
      });
    }

    return mappings;
  }
}
