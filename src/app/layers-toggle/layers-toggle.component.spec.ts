import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LayersToggleComponent } from './layers-toggle.component';

describe('LayersToggleComponent', () => {
  let component: LayersToggleComponent;
  let fixture: ComponentFixture<LayersToggleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayersToggleComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LayersToggleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
