const fetch = (...args: Parameters<typeof import('node-fetch', { with: { 'resolution-mode': 'import' } })['default']>) => import('node-fetch').then(mod => mod.default(...args));

export default fetch