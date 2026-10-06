// SPDX-License-Identifier: MIT
import api from './api';

export const preferenciasCuenta = () => api.get('/cuenta/preferencias').then((r) => r.data.data);
export const guardarPreferenciasCuenta = (datos) => api.put('/cuenta/preferencias', datos).then((r) => r.data.data);
