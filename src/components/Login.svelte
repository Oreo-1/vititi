<script>
  import { login, register } from '../lib/auth.svelte.js';

  let mode = $state('login');
  let password = $state('');
  let name = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(e) {
    e.preventDefault();
    error = '';
    busy = true;
    try {
      if (mode === 'login') await login(name, password);
      else await register(name, password);
    } catch (err) {
      error = err?.response?.message || err?.message || 'Failed';
      const fields = err?.response?.data;
      if (fields && Object.keys(fields).length) {
        error += ' — ' + Object.entries(fields).map(([k, v]) => `${k}: ${v.message}`).join('; ');
      }
    } finally {
      busy = false;
    }
  }
</script>

<div class="container py-5" style="max-width: 420px">
  <h1 class="h3 mb-3">Vititi VTT</h1>
  <ul class="nav nav-tabs mb-3">
    <li class="nav-item"><button class="nav-link" class:active={mode === 'login'} onclick={() => (mode = 'login')}>Login</button></li>
    <li class="nav-item"><button class="nav-link" class:active={mode === 'register'} onclick={() => (mode = 'register')}>Register</button></li>
  </ul>
  <form onsubmit={submit}>
    <div class="mb-3">
      <label class="form-label" for="name">Name</label>
      <input id="name" class="form-control" bind:value={name} autocomplete="username" minlength="2" maxlength="50" required />
    </div>
    <div class="mb-3">
      <label class="form-label" for="pw">Password</label>
      <input id="pw" type="password" class="form-control" bind:value={password} autocomplete="current-password" required />
    </div>
    {#if error}<div class="alert alert-danger">{error}</div>{/if}
    <button class="btn btn-primary w-100" disabled={busy}>{mode === 'login' ? 'Login' : 'Create player account'}</button>
    {#if mode === 'register'}
      <div class="form-text">New accounts are players. A DM account is promoted in the PocketBase dashboard.</div>
    {/if}
  </form>
</div>
