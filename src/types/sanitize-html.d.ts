declare module 'sanitize-html' {
  const sanitizeHtml: (html: string, options?: Record<string, unknown>) => string;
  export = sanitizeHtml;
  export default sanitizeHtml;
}
