import { createAction, props } from '@ngrx/store';
import { User } from '../types';

export const login = createAction(
  '[auth] login',
  props<{ username: string; password: string }>(),
);

export const loginError = createAction(
  '[auth] loginError',
  props<{ errorMsg: string }>(),
);

export const loginSuccess = createAction(
  '[auth] loginSuccess',
  props<{ redirectTo: string; user: User }>(),
);

export const logout = createAction('[auth] logout');

export const logoutSuccess = createAction('[auth] logoutSuccess');
