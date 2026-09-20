<script setup>
import { t } from '../store.js';
const props = defineProps({ titleKey: { type: String, default: 'nav.files' } });
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2>{{ t(props.titleKey) }}</h2>
      </div>
    </div>
    <el-empty :description="t('dev.inprogress')" />
  </div>
</template>
