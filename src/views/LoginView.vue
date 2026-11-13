<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login } from '@/api/auth'
import { saveSession } from '@/api/session'
import { usePageTitle } from '@/composables/usePageTitle'
import logoUrl from '@/assets/logo.png'

usePageTitle('Sign in')

const route = useRoute()
const router = useRouter()

/** Back to the page that sent us here (?redirect=/some/path, same-site paths only), else Spreads */
function redirectTarget(): string {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') ? r : '/spreads'
}
const form = reactive({ email: '', password: '' })
const showPassword = ref(false)
const error = ref('')
const submitting = ref(false)

async function submit() {
  error.value = !form.email.trim() || !form.password ? 'Enter your email and password.' : ''
  if (error.value) return

  submitting.value = true
  try {
    saveSession(await login(form.email.trim(), form.password))
    await router.replace(redirectTarget())
  } catch (e) {
    error.value = (e as Error).message
    form.password = ''
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login">
    <form class="card" novalidate @submit.prevent="submit">
      <div class="brand">
        <img :src="logoUrl" alt="" width="40" height="40" />
        <span>MadSpread<span class="accent">Lab</span></span>
      </div>

      <h1>Sign in</h1>

      <label for="login-email">Email</label>
      <input id="login-email" v-model="form.email" type="email" autocomplete="username" autofocus />

      <label for="login-password">Password</label>
      <div class="password">
        <input
          id="login-password"
          v-model="form.password"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="current-password"
        />
        <button type="button" class="btn ghost sm" @click="showPassword = !showPassword">
          {{ showPassword ? 'Hide' : 'Show' }}
        </button>
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" class="btn primary" :disabled="submitting">
        {{ submitting ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.login {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 2rem 1rem;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  max-width: 380px;
  padding: 2rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--card-background);
  box-shadow: var(--shadow-card);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-heading);
}
.accent {
  font-weight: 700;
  color: var(--color-accent);
}

h1 {
  margin: 1rem 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-heading);
}

label {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-heading);
}

input {
  width: 100%;
  min-height: 42px;
  padding: 0.5rem 0.75rem;
  font: inherit;
  color: var(--color-heading);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border-hover);
  border-radius: 10px;
}
input:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 0;
  border-color: transparent;
}

.password {
  position: relative;
}
.password input {
  padding-right: 4.5rem;
}
.password .btn {
  position: absolute;
  top: 50%;
  right: 0.35rem;
  transform: translateY(-50%);
}

.error {
  margin-top: 0.5rem;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  font-size: 0.85rem;
}
.error {
  color: #ff8a8a;
  background: color-mix(in srgb, #e5484d 12%, transparent);
}
:root[data-theme='light'] .error {
  color: #c62828;
}

.btn.primary {
  margin-top: 1rem;
  min-height: 44px;
}
</style>
