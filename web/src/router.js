import { createRouter, createWebHistory } from 'vue-router';
import FilesView from './views/FilesView.vue';
import GenerateView from './views/GenerateView.vue';
import StyleTemplatesView from './views/StyleTemplatesView.vue';
import UsersView from './views/UsersView.vue';
import SsoView from './views/SsoView.vue';
import AuditView from './views/AuditView.vue';

const routes = [
  { path: '/', redirect: '/files' },
  { path: '/files', name: 'files', component: FilesView },
  { path: '/generate', name: 'generate', component: GenerateView },
  { path: '/styles', name: 'styles', component: StyleTemplatesView },
  { path: '/users', name: 'users', component: UsersView },
  { path: '/sso', name: 'sso', component: SsoView },
  { path: '/audit', name: 'audit', component: AuditView },
];

export default createRouter({
  history: createWebHistory('/'),
  routes,
});
