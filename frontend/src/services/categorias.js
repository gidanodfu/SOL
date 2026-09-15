import api from './api';

export const listarCategorias = () => api.get('/categorias').then((r) => r.data.data);
