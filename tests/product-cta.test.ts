import { expect, it } from 'vitest';
import { isProductCta } from '../server/domain/product-cta';

const suggestion='Вчителі, спробуйте почати заняття з одного прикладу.';
it.each(['teaching','life'])('allows ordinary educator suggestions in %s', category=>{
  expect(isProductCta(suggestion,category)).toBe(false);
});
it('counts a suggestion explicitly categorized as product',()=>{
  expect(isProductCta(suggestion,'product')).toBe(true);
});
it.each(['Mimiao','Міміао','CRM'])('counts a product solicitation mentioning %s in any category',brand=>{
  expect(isProductCta(`Власники шкіл, спробуйте ${brand}.`,'teaching')).toBe(true);
});
it('does not treat product information alone as a call to action',()=>{
  expect(isProductCta('Власники шкіл, Mimiao створено для навчальних центрів.','product')).toBe(false);
});
it.each(['Вчителі, деталі: https://example.org.','Вчителі, реєструйте свої школи.','Вчителі, посилання є у профілі.'])('retains conservative URL, registration and profile calls: %s',text=>{
  expect(isProductCta(text,'life')).toBe(true);
});
