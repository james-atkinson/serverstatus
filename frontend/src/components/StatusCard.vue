<template>
  <section class="card">
    <header class="card-header">
      <h2>{{ title }}</h2>
      <div class="card-header-right">
        <span v-if="subtitle">{{ subtitle }}</span>
        <slot name="header-right" />
      </div>
    </header>
    <div class="card-body">
      <slot />
    </div>
  </section>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: "" }
});
</script>
