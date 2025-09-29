import Module from 'module';
import path from 'path';

class SafeModalSubmitFields {
  public components: unknown[] = [];

  public fields: {
    getField: (customId: string) => { value: string };
  };

  private fieldsMap: Record<string, string> = {};

  constructor(components: unknown) {
    this.components = Array.isArray(components) ? components : [];

    try {
      const rows = this.components as Array<Record<string, unknown>>;
      for (const row of rows) {
        const labeled = row?.component ? [row.component] : undefined;
        const innerComponents = Array.isArray(row?.components) ? row.components : labeled || [];

        for (const comp of innerComponents) {
          const leaf = comp?.component || comp;
          const isTextInput = leaf?.type === 4 || typeof leaf?.style === 'number';
          if (!isTextInput) continue;
          const id = leaf?.custom_id || leaf?.customId || leaf?.id;
          if (!id) continue;
          const value = typeof leaf?.value === 'string' ? leaf.value : '';
          this.fieldsMap[id] = value;
        }
      }
    } catch {
      // ignore
    }

    this.fields = {
      getField: (customId: string) => {
        if (!(customId in this.fieldsMap)) {
          throw new Error(`Text input with custom id '${customId}' not found`);
        }
        return { value: this.fieldsMap[customId] };
      },
    };
  }

  getTextInputValue(customId: string): string {
    return this.fields.getField(customId).value;
  }
}

try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyModule = Module as any;
  const originalLoad = anyModule._load;
  anyModule._load = function (
    this: unknown,
    request: string,
    parent: unknown,
    _isMain: boolean,
    ...args: unknown[]
  ) {
    try {
      const resolved = anyModule._resolveFilename(request, parent);
      if (typeof resolved === 'string') {
        const normalized = path.posix.normalize(resolved.replace(/\\/g, '/'));
        if (normalized.includes('/structures/ModalSubmitFields.js')) {
          return SafeModalSubmitFields;
        }
      }
    } catch {
      // fallthrough
    }
    return originalLoad.apply(this, [request, parent, _isMain, ...args] as const);
  };
} catch {
  // ignore
}
