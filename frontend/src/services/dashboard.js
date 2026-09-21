// SPDX-License-Identifier: MIT
import api from './api';

export const dashboardAdmin = (params = {}) => api.get('/admin/dashboard', { params }).then((r) => r.data.data);

export const exportarReporteAdmin = (params = {}) =>
  api.get('/admin/reportes/excel', { params, responseType: 'blob' }).then((r) => r.data);
