import { Component, OnInit } from '@angular/core';
import { ActiveCartFacade } from '@spartacus/cart/base/root';
import { Observable } from 'rxjs';

// @conductor REQ-CART
@Component({
  selector: 'cx-order',
  templateUrl: './order.component.html',
})
export class OrderComponent implements OnInit {
  cart$: Observable<unknown> = this.activeCart.getActive();

  constructor(protected activeCart: ActiveCartFacade) {}

  ngOnInit(): void {}
}
