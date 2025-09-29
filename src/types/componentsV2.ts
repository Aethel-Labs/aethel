export type V2ComponentType = 3 | 4 | 10 | 12 | 18;

export interface V2BaseComponent {
  type: V2ComponentType;
}

export interface V2StringSelect extends V2BaseComponent {
  type: 3;
  custom_id: string;
  placeholder?: string;
  options: Array<{
    label: string;
    value: string;
    description?: string;
    emoji?: { id?: string; name?: string; animated?: boolean };
  }>;
  min_values?: number;
  max_values?: number;
}

export interface V2TextInput extends V2BaseComponent {
  type: 4;
  custom_id: string;
  style: 1 | 2;
  label?: string;
  placeholder?: string;
  required?: boolean;
  min_length?: number;
  max_length?: number;
  value?: string;
}

export interface V2LabeledComponent extends V2BaseComponent {
  type: 18;
  label?: string;
  description?: string;
  component: V2StringSelect | V2TextInput;
}

export type V2ModalRow =
  | V2LabeledComponent
  | { type: 1; components: V2TextInput[] }
  | { type: 18; components: V2TextInput[] };

export interface V2SubmissionValueMap {
  [customId: string]: string | string[];
}

export interface V2ModalPayload {
  custom_id: string;
  title: string;
  components: V2ModalRow[];
}

interface V2Component {
  type: number;
  custom_id?: string;
  customId?: string;
  value?: string | string[];
  values?: string[];
  [key: string]: unknown;
}

interface V2Row {
  component?: V2Component;
  components?: V2Component[];
  type?: number;
  [key: string]: unknown;
}

export function buildProviderModal(customId: string, title: string): V2ModalPayload {
  return {
    custom_id: customId,
    title,
    components: [
      {
        type: 18,
        label: 'AI Provider',
        description: 'Select an authorized provider',
        component: {
          type: 3,
          custom_id: 'provider',
          placeholder: 'Choose provider',
          options: [
            { label: 'OpenAI', value: 'openai', description: 'api.openai.com' },
            { label: 'OpenRouter', value: 'openrouter', description: 'openrouter.ai' },
            {
              label: 'Google Gemini',
              value: 'gemini',
              description: 'generativelanguage.googleapis.com',
            },
            { label: 'DeepSeek', value: 'deepseek', description: 'api.deepseek.com' },
            { label: 'Moonshot AI', value: 'moonshot', description: 'api.moonshot.ai' },
            { label: 'Perplexity AI', value: 'perplexity', description: 'api.perplexity.ai' },
          ],
        },
      },
      {
        type: 1 as const,
        components: [
          {
            type: 4,
            custom_id: 'model',
            label: 'Model',
            style: 1,
            required: true,
            placeholder: 'openai/gpt-4o-mini',
            min_length: 2,
            max_length: 100,
          },
        ],
      },
      {
        type: 1 as const,
        components: [
          {
            type: 4,
            custom_id: 'apiKey',
            label: 'API Key',
            style: 1,
            required: true,
            placeholder: 'sk-... or other',
            min_length: 10,
            max_length: 500,
          },
        ],
      },
    ],
  };
}

interface RawModalSubmission {
  fields?: {
    getTextInputValue?: (id: string) => string;
    [key: string]: unknown;
  };
  data?: {
    components?: Array<{
      component?: V2Component;
      components?: V2Component[];
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  components?: Array<{
    component?: V2Component;
    components?: V2Component[];
    [key: string]: unknown;
  }>;
  message?: {
    components?: Array<{
      component?: V2Component;
      components?: V2Component[];
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function parseV2ModalSubmission(raw: RawModalSubmission): V2SubmissionValueMap {
  const result: V2SubmissionValueMap = {};
  try {
    const fields = raw?.fields as { getTextInputValue?: (id: string) => string } | undefined;
    if (fields?.getTextInputValue) {
      for (const id of ['model', 'apiKey']) {
        try {
          const v = fields.getTextInputValue(id);
          if (v !== undefined && v !== '') result[id] = v;
        } catch (error) {
          console.error(`Error getting text input value for ${id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error processing text input fields:', error);
  }

  try {
    const mergedRows = (
      [
        ...(raw?.data?.components || []),
        ...(raw?.components || []),
        ...(raw?.message?.components || []),
      ] as Array<V2Row | undefined>
    ).filter(Boolean) as V2Row[];

    const flat = mergedRows.flatMap((r) => (r.component ? [r.component] : r.components || []));

    for (const c of flat) {
      if (!c) continue;

      if (c.customId === 'provider' || c.custom_id === 'provider') {
        if (Array.isArray((c as { values?: string[] }).values)) {
          result.provider = (c as { values: string[] }).values;
        } else if ((c as { value?: string | string[] }).value) {
          const value = (c as { value: string | string[] }).value;
          result.provider = Array.isArray(value) ? value : [value];
        }
      }

      if (c.type === 4 && (c.custom_id || c.customId) && (c as { value?: unknown }).value) {
        const value = (c as { value: unknown }).value;
        if (typeof value === 'string') {
          result[c.custom_id || c.customId!] = value;
        }
      }
    }
  } catch (error) {
    console.error('Error processing component values:', error);
  }
  return result;
}

export const PROVIDER_TO_URL: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  gemini: 'https://generativelanguage.googleapis.com',
  deepseek: 'https://api.deepseek.com',
  moonshot: 'https://api.moonshot.ai',
  perplexity: 'https://api.perplexity.ai',
};
