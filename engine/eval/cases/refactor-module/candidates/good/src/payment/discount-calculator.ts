// @conductor REQ-DISCOUNT-CALC
export class DiscountCalculator {
  applyDiscount(items: { price: number }[], code: string): number {
    const subtotal = items.reduce((s, i) => s + i.price, 0);
    return code === 'SAVE10' ? subtotal * 0.9 : subtotal;
  }
}
