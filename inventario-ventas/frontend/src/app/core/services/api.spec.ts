import { TestBed } from '@angular/core/testing';
import { ApiService } from './api';

describe('ApiService', () => {
  it('should be created', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ApiService);
    expect(service).toBeTruthy();
  });
});