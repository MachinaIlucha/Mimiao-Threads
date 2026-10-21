export function isProductCta(text: string, category: string): boolean {
  return /https?:|реєструйте|посилання.*профіл/iu.test(text)
    || (/спробуйте/iu.test(text) && (category === 'product' || /\bMimiao\b|CRM|Міміао/iu.test(text)));
}
