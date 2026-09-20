import { createApp } from 'vue';
import 'element-plus/theme-chalk/dark/css-vars.css';
import { Document, MagicStick, Brush, User, Key, Clock, Sunny, Moon, Message, Lock, Promotion } from '@element-plus/icons-vue';
import App from './App.vue';
import router from './router.js';
import './style.css';

const app = createApp(App);
// Register only the icons used by the shell / login (keeps the bundle small).
for (const c of [Document, MagicStick, Brush, User, Key, Clock, Sunny, Moon, Message, Lock, Promotion]) app.component(c.name, c);
app.use(router);

// Load public metadata for feature detection in views.
window.__AIDocMeta = {};
fetch('/api/meta').then((r) => r.ok ? r.json() : null).then((m) => { if (m) window.__AIDocMeta = m; }).catch(() => {});

app.mount('#app');
