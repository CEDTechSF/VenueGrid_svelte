<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';
  import type { Layout, Seat, User, Invite, AdminBooking } from '$lib/types';
  import { editor } from '$lib/stores/editor';
  import { addToast, showSpinner, hideSpinner } from '$lib/stores/ui';
  import { api, apiPost, apiPut, apiDelete } from '$lib/api/client';
  import BookingGrid from '$lib/components/BookingGrid.svelte';
  import GridEditor from '$lib/components/GridEditor.svelte';

  export let data: PageData;

  // ── Reactive page data ──────────────────────────────────────────────────────
  $: user       = data.user as User | null;
  $: layouts    = data.layouts as Layout[];

  // ── Tab state ───────────────────────────────────────────────────────────────
  type Tab = 'account' | 'layouts' | 'admin';
  let activeTab: Tab = 'layouts';

  function parseTab(value: string | null): Tab | null {
    if (value === 'account' || value === 'layouts' || value === 'admin') return value;
    return null;
  }

  function parsePositiveInt(value: string | null): number | null {
    if (!value) return null;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  function syncStateToUrl(tabOverride?: Tab, mode: 'replace' | 'push' = 'replace') {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const tab = tabOverride ?? activeTab;
    url.searchParams.set('tab', tab);

    if (currentLayout?.id) url.searchParams.set('layout', String(currentLayout.id));
    else url.searchParams.delete('layout');

    if (selectedAdminLayoutId) url.searchParams.set('adminLayout', selectedAdminLayoutId);
    else url.searchParams.delete('adminLayout');

    if (editorLayoutId !== null) url.searchParams.set('editor', String(editorLayoutId));
    else url.searchParams.delete('editor');

    if (mode === 'push') {
      window.history.pushState(window.history.state, '', url);
    } else {
      window.history.replaceState(window.history.state, '', url);
    }
  }

  function setActiveTab(tab: Tab, mode: 'replace' | 'push' = 'replace') {
    const safeTab: Tab = tab === 'admin' && !user?.is_admin ? 'layouts' : tab;
    activeTab = safeTab;
    syncStateToUrl(safeTab, mode);
  }

  // ── Auth forms ───────────────────────────────────────────────────────────────
  let showLogin     = false;
  let regName       = '';
  let regEmail      = '';
  let loginEmail    = '';
  let authError     = '';
  let claimToken    = '';
  let adminSecret   = '';
  let adminUserId   = '';
  let authMsg       = '';

  // ── Booking state ────────────────────────────────────────────────────────────
  let currentLayout: Layout | null = null;
  let currentSeats: Array<{ id: number; row: number; col: number; label: string; booked_by: number | null; grp_name: string | null }> = [];
  let selection     = new Set<number>();
  let bookingInFlight = false;
  let loadingSeats  = false;

  // ── Admin state ───────────────────────────────────────────────────────────────
  let adminLayouts: Layout[] = [];
  let selectedAdminLayoutId = '';
  let editName      = '';
  let editMaxPerUser: string = '';
  let adminBookings: AdminBooking[] = [];
  let invites: Invite[] = [];
  let adminMsg      = '';
  let gridMsg       = '';
  let createName    = '';
  let createRows    = 8;
  let createCols    = 8;
  let createMaxPerUser: string = '';
  let editorLayoutId: number | null = null;

  // ── Auth ─────────────────────────────────────────────────────────────────────
  async function register() {
    authError = '';
    try {
      await apiPost('/api/register', { name: regName, email: regEmail });
      await invalidateAll();
      regName = ''; regEmail = '';
      addToast('Registered and logged in!', 'success');
      setActiveTab('layouts');
    } catch (e: any) { authError = e.message ?? 'Registration failed'; }
  }

  async function login() {
    authError = '';
    try {
      await apiPost('/api/login', { email: loginEmail });
      await invalidateAll();
      loginEmail = '';
      addToast('Logged in!', 'success');
      setActiveTab('layouts');
    } catch (e: any) { authError = e.message ?? 'Login failed'; }
  }

  async function logout() {
    try {
      await apiPost('/api/logout', {});
      await invalidateAll();
      currentLayout = null; currentSeats = []; selection = new Set();
      addToast('Logged out', 'info');
      setActiveTab('account');
    } catch (e: any) { addToast('Logout failed', 'error'); }
  }

  async function claimInvite() {
    authMsg = '';
    try {
      const res = await apiPost<{ promoted?: boolean }>('/api/claim-invite', { token: claimToken });
      claimToken = '';
      await invalidateAll();
      authMsg = res.promoted ? 'Invite claimed! You are now an admin.' : 'Invite claimed!';
    } catch (e: any) { authMsg = e.message ?? 'Invalid or used invite'; }
  }

  async function makeAdmin() {
    authMsg = '';
    try {
      await apiPost('/api/make-admin', { userId: Number(adminUserId), secret: adminSecret });
      adminSecret = ''; adminUserId = '';
      await invalidateAll();
      authMsg = 'User promoted to admin.';
    } catch (e: any) { authMsg = e.message ?? 'Failed'; }
  }

  // ── Booking ───────────────────────────────────────────────────────────────────
  async function loadLayoutSeats(layout: Layout, historyMode: 'replace' | 'push' = 'replace') {
    loadingSeats = true;
    selection = new Set();
    currentLayout = layout;
    currentSeats = [];
    try {
      const res = await api<{ seats: typeof currentSeats }>(`/api/layouts/${layout.id}`);
      currentSeats = res.seats;
      syncStateToUrl(undefined, historyMode);
    } catch (e: any) {
      addToast('Failed to load seats', 'error');
    } finally { loadingSeats = false; }
  }

  function toggleSelection(seatId: number) {
    const seat = currentSeats.find(s => s.id === seatId);
    if (!seat || (seat.booked_by !== null && seat.booked_by !== user?.id)) return;
    const next = new Set(selection);
    if (next.has(seatId)) next.delete(seatId);
    else next.add(seatId);
    selection = next;
  }

  async function bookSelected() {
    if (bookingInFlight || selection.size === 0 || !currentLayout || !user) return;
    bookingInFlight = true;
    showSpinner('Booking…');
    try {
      const ids = [...selection];
      const res = await apiPost<{ seats: typeof currentSeats }>(
        `/api/layouts/${currentLayout.id}/book-multiple`,
        { seatIds: ids }
      );
      // Merge updated seats
      const updated = new Map(res.seats.map(s => [s.id, s]));
      currentSeats = currentSeats.map(s => updated.get(s.id) ?? s);
      selection = new Set();
      addToast(`Booked ${ids.length} seat${ids.length > 1 ? 's' : ''}!`, 'success');
    } catch (e: any) {
      addToast(e.message ?? 'Booking failed', 'error');
    } finally {
      bookingInFlight = false;
      hideSpinner();
    }
  }

  async function unbookSeat(seatId: number) {
    if (!currentLayout) return;
    showSpinner('Unbooking…');
    try {
      await apiPost(`/api/layouts/${currentLayout.id}/unbook`, { seatId });
      currentSeats = currentSeats.map(s => s.id === seatId ? { ...s, booked_by: null } : s);
      selection = new Set([...selection].filter(id => id !== seatId));
      addToast('Seat unbooked', 'info');
    } catch (e: any) {
      addToast(e.message ?? 'Unbook failed', 'error');
    } finally { hideSpinner(); }
  }

  // ── Admin helpers ─────────────────────────────────────────────────────────────
  async function loadAdminLayouts() {
    try {
      adminLayouts = await api<Layout[]>('/api/admin/layouts');
    } catch { addToast('Failed to load admin layouts', 'error'); }
  }

  async function loadAdminBookings() {
    try {
      adminBookings = await api<AdminBooking[]>('/api/admin/bookings');
    } catch { addToast('Failed to load bookings', 'error'); }
  }

  async function loadInvites() {
    try {
      invites = await api<Invite[]>('/api/admin/invites');
    } catch { addToast('Failed to load invites', 'error'); }
  }

  async function createLayout() {
    adminMsg = '';
    if (!createName.trim()) { adminMsg = 'Name required'; return; }
    showSpinner('Creating layout…');
    try {
      await apiPost('/api/layouts', {
        name: createName.trim(),
        rows: createRows,
        cols: createCols,
        max_per_user: createMaxPerUser ? Number(createMaxPerUser) : null
      });
      createName = ''; createRows = 8; createCols = 8; createMaxPerUser = '';
      await invalidateAll();
      await loadAdminLayouts();
      adminMsg = 'Layout created!';
    } catch (e: any) { adminMsg = e.message ?? 'Failed to create layout'; }
    finally { hideSpinner(); }
  }

  async function saveLayoutMeta() {
    adminMsg = '';
    if (!selectedAdminLayoutId) return;
    showSpinner('Saving…');
    try {
      await apiPut(`/api/admin/layouts/${selectedAdminLayoutId}`, {
        name: editName,
        max_per_user: editMaxPerUser ? Number(editMaxPerUser) : null
      });
      await loadAdminLayouts();
      await invalidateAll();
      adminMsg = 'Saved!';
    } catch (e: any) { adminMsg = e.message ?? 'Save failed'; }
    finally { hideSpinner(); }
  }

  async function deleteLayout() {
    if (!selectedAdminLayoutId || !confirm('Delete this layout and all its seats? This cannot be undone.')) return;
    showSpinner('Deleting…');
    try {
      await apiDelete(`/api/admin/layouts/${selectedAdminLayoutId}`);
      selectedAdminLayoutId = '';
      editorLayoutId = null;
      syncStateToUrl();
      await loadAdminLayouts();
      await invalidateAll();
      adminMsg = 'Layout deleted.';
    } catch (e: any) { adminMsg = e.message ?? 'Delete failed'; }
    finally { hideSpinner(); }
  }

  async function openEditorForLayout(historyMode: 'replace' | 'push' = 'replace') {
    if (!selectedAdminLayoutId) return;
    const id = Number(selectedAdminLayoutId);
    showSpinner('Loading editor…');
    try {
      const res = await api<{
        layout: Layout;
        seats: Array<{ row: number; col: number; label: string; group_id: number | null; grp_name: string | null; grp_base: string | null; grp_num: number | null; grp_prefix: string | null; grp_data: string | null }>;
        groups: Array<{ id: number; name: string; base: string | null; num: number | null; prefix: string | null; data: string | null }>;
      }>(`/api/admin/layouts/${id}`);

      const { layout, seats, groups } = res;

      // Check for localStorage draft
      const draftKey = `venuegrid.editor.draft.${id}`;
      let cells: any[] | null = null;
      let groupMeta: Record<string, any> = {};
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft.savedAt && Date.now() - draft.savedAt < 7 * 24 * 3600_000) {
            if (confirm('A local draft was found — load it?')) {
              cells = draft.cells;
              groupMeta = draft.groupMeta ?? {};
            }
          }
        }
      } catch { /* ignore */ }

      if (!cells) {
        // Build cells array from server data
        cells = Array(layout.rows * layout.cols).fill(null);
        for (const s of seats) {
          const idx = (s.row - 1) * layout.cols + (s.col - 1);
          if (idx >= 0 && idx < cells.length) {
            cells[idx] = {
              label: s.label,
              group: s.grp_name ? { name: s.grp_name, base: s.grp_base, num: s.grp_num, prefix: s.grp_prefix } : null
            };
          }
        }
        groupMeta = {};
        for (const g of groups) {
          groupMeta[g.name] = { id: g.id, base: g.base, num: g.num, prefix: g.prefix, data: g.data };
        }
      }

      editor.init(layout.rows, layout.cols, cells, groupMeta);
      editorLayoutId = id;
      syncStateToUrl(undefined, historyMode);
    } catch (e: any) {
      addToast(e.message ?? 'Failed to load editor', 'error');
    } finally { hideSpinner(); }
  }

  async function saveGrid() {
    if (!editorLayoutId) return;
    gridMsg = '';
    showSpinner('Saving grid…');
    try {
      const state = $editor;

      // Build cells payload (only non-null cells)
      const cells: Array<{ row: number; col: number; label: string; group: string | null }> = [];
      for (let i = 0; i < state.cells.length; i++) {
        const cell = state.cells[i];
        if (!cell) continue;
        const row = Math.floor(i / state.cols) + 1;
        const col = (i % state.cols) + 1;
        cells.push({ row, col, label: cell.label, group: cell.group?.name ?? null });
      }

      const res = await apiPost<{ ok: boolean; nameMapping: Record<string, string> }>(
        `/api/admin/layouts/${editorLayoutId}/grid`,
        { rows: state.rows, cols: state.cols, cells, groupMeta: state.groupMeta }
      );

      if (Object.keys(res.nameMapping).length > 0) {
        editor.applyNameMapping(res.nameMapping);
      }

      // Clear draft
      try { localStorage.removeItem(`venuegrid.editor.draft.${editorLayoutId}`); } catch { /* */ }

      await invalidateAll();
      gridMsg = 'Grid saved!';
      editor.clearUnsavedRenameFlag();
      addToast('Grid saved!', 'success');
    } catch (e: any) {
      gridMsg = e.message ?? 'Save failed';
      addToast(gridMsg, 'error');
    } finally { hideSpinner(); }
  }

  async function adminUnbook(seatId: number) {
    showSpinner('Unbooking…');
    try {
      await apiPost('/api/admin/unbook', { seatId });
      adminBookings = adminBookings.filter(b => b.id !== seatId);
      addToast('Seat unbooked', 'info');
    } catch (e: any) { addToast(e.message ?? 'Failed', 'error'); }
    finally { hideSpinner(); }
  }

  async function createInvite(kind: 'user' | 'admin') {
    try {
      const invite = await apiPost<Invite>('/api/admin/invites', { kind });
      invites = [invite, ...invites];
      addToast(`Invite token: ${invite.token}`, 'success');
    } catch (e: any) { addToast(e.message ?? 'Failed', 'error'); }
  }

  async function deleteInvite(id: number) {
    try {
      await apiDelete(`/api/admin/invites/${id}`);
      invites = invites.filter(i => i.id !== id);
    } catch (e: any) { addToast(e.message ?? 'Failed', 'error'); }
  }

  // Populate edit form when admin layout selection changes
  $: if (selectedAdminLayoutId) {
    const l = adminLayouts.find(x => String(x.id) === selectedAdminLayoutId);
    if (l) {
      editName = l.name;
      editMaxPerUser = l.max_per_user != null ? String(l.max_per_user) : '';
    }
  }

  // Load admin data when admin tab opens
  function openAdminTab() {
    setActiveTab('admin', 'push');
    loadAdminLayouts();
    loadAdminBookings();
    loadInvites();
  }

  onMount(() => {
    const restoreFromUrl = async () => {
      const url = new URL(window.location.href);
      const initialTab = parseTab(url.searchParams.get('tab'));
      activeTab = initialTab === 'admin' && !user?.is_admin ? 'layouts' : (initialTab ?? activeTab);

      const layoutId = parsePositiveInt(url.searchParams.get('layout'));
      if (activeTab === 'layouts' && layoutId) {
        const layout = layouts.find((l) => l.id === layoutId);
        if (layout) await loadLayoutSeats(layout);
      }

      if (activeTab === 'admin' && user?.is_admin) {
        await loadAdminLayouts();
        await loadAdminBookings();
        await loadInvites();

        const adminLayoutId = parsePositiveInt(url.searchParams.get('adminLayout'));
        if (adminLayoutId && adminLayouts.some((l) => l.id === adminLayoutId)) {
          selectedAdminLayoutId = String(adminLayoutId);
        }

        const editorId = parsePositiveInt(url.searchParams.get('editor'));
        if (editorId && selectedAdminLayoutId === String(editorId)) {
          await openEditorForLayout();
        }
      }

      syncStateToUrl();
    };

    void restoreFromUrl();

    const onPopState = () => {
      void restoreFromUrl();
    };
    window.addEventListener('popstate', onPopState);

    // Clean up stale drafts (> 7 days old)
    try {
      const prefix = 'venuegrid.editor.draft.';
      const cutoff = Date.now() - 7 * 24 * 3600_000;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(prefix)) {
          try {
            const d = JSON.parse(localStorage.getItem(k) ?? '{}');
            if (!d.savedAt || d.savedAt < cutoff) localStorage.removeItem(k);
          } catch { localStorage.removeItem(k!); }
        }
      }
    } catch { /* ignore */ }
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  });

  $: if (activeTab === 'admin') {
    syncStateToUrl();
  }
</script>

<svelte:head>
  <title>VenueGrid</title>
</svelte:head>

<div class="app">
  <!-- ─── Header ─── -->
  <header class="header">
    <span class="header__logo">VenueGrid</span>
    <nav class="header__nav">
      <button class:active={activeTab === 'account'} on:click={() => setActiveTab('account', 'push')}>
        {user ? user.name : 'Account'}
      </button>
      <button class:active={activeTab === 'layouts'} on:click={() => setActiveTab('layouts', 'push')}>
        Layouts
      </button>
      {#if user?.is_admin}
        <button class:active={activeTab === 'admin'} on:click={openAdminTab}>
          Admin
        </button>
      {/if}
    </nav>
  </header>

  <!-- ─── Account Tab ─── -->
  {#if activeTab === 'account'}
    <main class="container">
      {#if user}
        <section class="card">
          <h2>Your Account</h2>
          <p><strong>Name:</strong> {user.name}</p>
          <p><strong>Email:</strong> {user.email}</p>
          {#if user.is_admin}<p><span class="badge badge--admin">Admin</span></p>{/if}
          <button class="btn btn--secondary" on:click={logout}>Log out</button>
        </section>

        <section class="card">
          <h3>Claim an invite</h3>
          <div class="row">
            <input type="text" bind:value={claimToken} placeholder="8-character token" maxlength="16" />
            <button class="btn btn--primary" on:click={claimInvite} disabled={!claimToken.trim()}>Claim</button>
          </div>
          {#if authMsg}<p class="form-msg">{authMsg}</p>{/if}
        </section>

        {#if user.is_admin}
          <section class="card">
            <h3>Promote user to admin</h3>
            <div class="row">
              <input type="number" bind:value={adminUserId} placeholder="User ID" />
              <input type="password" bind:value={adminSecret} placeholder="Admin secret" />
              <button class="btn btn--primary" on:click={makeAdmin} disabled={!adminUserId || !adminSecret}>Promote</button>
            </div>
            {#if authMsg}<p class="form-msg">{authMsg}</p>{/if}
          </section>
        {/if}
      {:else}
        <section class="card">
          <div class="auth-toggle">
            <button class:active={!showLogin} on:click={() => { showLogin = false; authError = ''; }}>Register</button>
            <button class:active={showLogin}  on:click={() => { showLogin = true;  authError = ''; }}>Log in</button>
          </div>

          {#if !showLogin}
            <form on:submit|preventDefault={register} class="form">
              <label>Name<input type="text" bind:value={regName} required /></label>
              <label>Email<input type="email" bind:value={regEmail} required /></label>
              {#if authError}<p class="form-error">{authError}</p>{/if}
              <button class="btn btn--primary" type="submit">Register</button>
            </form>
          {:else}
            <form on:submit|preventDefault={login} class="form">
              <label>Email<input type="email" bind:value={loginEmail} required /></label>
              {#if authError}<p class="form-error">{authError}</p>{/if}
              <button class="btn btn--primary" type="submit">Log in</button>
            </form>
          {/if}
        </section>
      {/if}
    </main>

  <!-- ─── Layouts Tab ─── -->
  {:else if activeTab === 'layouts'}
    <main class="container">
      {#if layouts.length === 0}
        <p class="empty-state">No layouts available yet.</p>
      {:else}
        <div class="layout-list">
          {#each layouts as l (l.id)}
            <button
              class="layout-card"
              class:layout-card--active={currentLayout?.id === l.id}
              on:click={() => loadLayoutSeats(l, 'push')}
            >
              <span class="layout-card__name">{l.name}</span>
              <span class="layout-card__dim">{l.rows} × {l.cols}</span>
            </button>
          {/each}
        </div>
      {/if}

      {#if currentLayout}
        <section class="card booking-section">
          <div class="booking-header">
            <h2>{currentLayout.name}</h2>
            {#if user && selection.size > 0}
              <button
                class="btn btn--primary"
                on:click={bookSelected}
                disabled={bookingInFlight}
              >
                Book {selection.size} seat{selection.size > 1 ? 's' : ''}
              </button>
            {/if}
          </div>

          {#if !user}
            <p class="info-msg">Log in to book seats.</p>
          {/if}

          {#if loadingSeats}
            <p class="loading">Loading seats…</p>
          {:else}
            <BookingGrid
              layout={currentLayout}
              seats={currentSeats}
              userId={user?.id ?? null}
              {selection}
              on:toggle={e => toggleSelection(e.detail)}
            />
          {/if}

          {#if user}
            {@const mySeats = currentSeats.filter(s => s.booked_by === user.id)}
            {#if mySeats.length > 0}
              <div class="my-seats">
                <h4>Your bookings:</h4>
                <ul>
                  {#each mySeats as s (s.id)}
                    <li>
                      {s.label}
                      <button class="btn-link" on:click={() => unbookSeat(s.id)}>Unbook</button>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          {/if}
        </section>
      {/if}
    </main>

  <!-- ─── Admin Tab ─── -->
  {:else if activeTab === 'admin' && user?.is_admin}
    <main class="container container--wide">

      <!-- Create layout -->
      <section class="card">
        <h3>Create Layout</h3>
        <div class="form-inline">
          <input type="text"   bind:value={createName} placeholder="Layout name" />
          <input type="number" bind:value={createRows} min="1" max="500" style="width:70px" />
          <span>×</span>
          <input type="number" bind:value={createCols} min="1" max="500" style="width:70px" />
          <input type="number" bind:value={createMaxPerUser} placeholder="Max per user (opt)" style="width:140px" />
          <button class="btn btn--primary" on:click={createLayout}>Create</button>
        </div>
        {#if adminMsg}<p class="form-msg">{adminMsg}</p>{/if}
      </section>

      <!-- Select + edit layout -->
      {#if adminLayouts.length > 0}
        <section class="card">
          <h3>Manage Layout</h3>
          <div class="form-inline">
            <select bind:value={selectedAdminLayoutId}>
              <option value="">— select layout —</option>
              {#each adminLayouts as l (l.id)}
                <option value={String(l.id)}>{l.name} ({l.rows}×{l.cols})</option>
              {/each}
            </select>
            {#if selectedAdminLayoutId}
              <button class="btn btn--primary" on:click={() => openEditorForLayout('push')}>Open Editor</button>
            {/if}
          </div>

          {#if selectedAdminLayoutId}
            <div class="form-inline" style="margin-top:.75rem">
              <input type="text" bind:value={editName} placeholder="Name" />
              <input type="number" bind:value={editMaxPerUser} placeholder="Max seats per user" style="width:160px" />
              <button class="btn btn--primary" on:click={saveLayoutMeta}>Save</button>
              <button class="btn btn--danger" on:click={deleteLayout}>Delete</button>
            </div>
          {/if}
        </section>
      {/if}

      <!-- Grid Editor -->
      {#if editorLayoutId !== null}
        <section class="card">
          <div class="card-header-row">
            <h3>Grid Editor</h3>
            <div class="card-header-actions">
              {#if gridMsg}<span class="form-msg" style="margin:0">{gridMsg}</span>{/if}
              {#if $editor.hasUnsavedRename}
                <span class="form-msg" style="margin:0;color:#9a6700">Unsaved group name changes</span>
              {/if}
              <button class="btn btn--primary" on:click={saveGrid}>Save Grid</button>
            </div>
          </div>
          <GridEditor layoutId={editorLayoutId} />
        </section>
      {/if}

      <!-- Bookings -->
      <section class="card">
        <div class="card-header-row">
          <h3>All Bookings ({adminBookings.length})</h3>
          <button class="btn" on:click={loadAdminBookings}>Refresh</button>
        </div>
        {#if adminBookings.length === 0}
          <p class="empty-state">No bookings.</p>
        {:else}
          <table class="table">
            <thead>
              <tr><th>Layout</th><th>Seat</th><th>User</th><th>Email</th><th></th></tr>
            </thead>
            <tbody>
              {#each adminBookings as b (b.id)}
                <tr>
                  <td>{b.layout_name}</td>
                  <td>{b.label}</td>
                  <td>{b.user_name}</td>
                  <td>{b.user_email}</td>
                  <td>
                    <button class="btn btn--danger btn--sm" on:click={() => adminUnbook(b.id)}>Unbook</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>

      <!-- Invites -->
      <section class="card">
        <div class="card-header-row">
          <h3>Invites</h3>
          <div class="card-header-actions">
            <button class="btn" on:click={() => createInvite('user')}>+ User invite</button>
            <button class="btn" on:click={() => createInvite('admin')}>+ Admin invite</button>
          </div>
        </div>
        {#if invites.length === 0}
          <p class="empty-state">No invites.</p>
        {:else}
          <table class="table">
            <thead>
              <tr><th>Token</th><th>Kind</th><th>Used</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {#each invites as inv (inv.id)}
                <tr>
                  <td><code>{inv.token}</code></td>
                  <td>{inv.kind}</td>
                  <td>{inv.used ? '✓' : '—'}</td>
                  <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                  <td>
                    <button class="btn btn--danger btn--sm" on:click={() => deleteInvite(inv.id)}>Delete</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>

    </main>
  {/if}
</div>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; }
  :global(body) { margin: 0; font-family: system-ui, sans-serif; background: #f0f0f0; color: #222; }

  .app { min-height: 100vh; display: flex; flex-direction: column; }

  /* Header */
  .header {
    background: #1e293b;
    color: #fff;
    padding: 0 1.5rem;
    height: 52px;
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }
  .header__logo { font-size: 1.1rem; font-weight: 700; letter-spacing: 0.5px; }
  .header__nav { display: flex; gap: 0.25rem; }
  .header__nav button {
    background: none;
    border: none;
    color: rgba(255,255,255,0.7);
    padding: 0.4rem 0.8rem;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .header__nav button:hover { background: rgba(255,255,255,0.1); color: #fff; }
  .header__nav button.active { background: rgba(255,255,255,0.18); color: #fff; }

  /* Containers */
  .container { max-width: 900px; margin: 2rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 1.25rem; }
  .container--wide { max-width: 1200px; }

  /* Card */
  .card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    padding: 1.25rem 1.5rem;
  }
  .card h2, .card h3, .card h4 { margin-top: 0; }
  .card-header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
  .card-header-row h3 { margin: 0; }
  .card-header-actions { display: flex; gap: 0.5rem; align-items: center; }

  /* Buttons */
  .btn {
    padding: 0.4rem 0.9rem;
    border: 1px solid #bbb;
    border-radius: 5px;
    cursor: pointer;
    background: #f5f5f5;
    font-size: 0.88rem;
  }
  .btn--primary   { background: #3b82f6; color: #fff; border-color: #2563eb; }
  .btn--secondary { background: #6b7280; color: #fff; border-color: #4b5563; }
  .btn--danger    { background: #ef4444; color: #fff; border-color: #dc2626; }
  .btn--sm { padding: 0.25rem 0.55rem; font-size: 0.8rem; }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn-link { background: none; border: none; color: #2563eb; cursor: pointer; font-size: 0.85rem; text-decoration: underline; padding: 0; }

  /* Forms */
  .form { display: flex; flex-direction: column; gap: 0.75rem; }
  .form label { display: flex; flex-direction: column; gap: 3px; font-size: 0.88rem; }
  .form input { border: 1px solid #ccc; border-radius: 5px; padding: 0.4rem 0.6rem; font-size: 0.9rem; }
  .form-inline { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .form-inline input, .form-inline select { border: 1px solid #ccc; border-radius: 5px; padding: 0.35rem 0.55rem; font-size: 0.88rem; }
  .form-error { color: #c0392b; font-size: 0.85rem; margin: 0; }
  .form-msg { color: #2d8a4e; font-size: 0.85rem; margin: 0.5rem 0 0; }

  /* Auth toggle */
  .auth-toggle { display: flex; border-bottom: 1px solid #ddd; margin-bottom: 1rem; }
  .auth-toggle button { border: none; background: none; padding: 0.5rem 1rem; cursor: pointer; font-size: 0.9rem; color: #666; }
  .auth-toggle button.active { color: #3b82f6; border-bottom: 2px solid #3b82f6; }

  /* Badge */
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
  .badge--admin { background: #dbeafe; color: #1d4ed8; }

  /* Layout list */
  .layout-list { display: flex; flex-wrap: wrap; gap: 0.65rem; }
  .layout-card {
    border: 2px solid transparent;
    border-radius: 8px;
    padding: 0.6rem 1rem;
    background: #fff;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
  }
  .layout-card:hover { border-color: #93c5fd; }
  .layout-card--active { border-color: #3b82f6; background: #eff6ff; }
  .layout-card__name { display: block; font-weight: 600; font-size: 0.9rem; }
  .layout-card__dim { display: block; font-size: 0.78rem; color: #888; }

  /* Booking section */
  .booking-section {}
  .booking-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
  .booking-header h2 { margin: 0; }

  .my-seats { margin-top: 1.25rem; }
  .my-seats h4 { margin: 0 0 0.5rem; font-size: 0.88rem; }
  .my-seats ul { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .my-seats li { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; background: #e3f2fd; padding: 3px 8px; border-radius: 4px; }

  /* Table */
  .table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .table th { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 2px solid #e0e0e0; color: #555; }
  .table td { padding: 0.35rem 0.6rem; border-bottom: 1px solid #f0f0f0; }
  .table tr:last-child td { border-bottom: none; }

  /* Misc */
  .empty-state { color: #999; font-size: 0.88rem; }
  .loading { color: #aaa; font-size: 0.88rem; }
  .info-msg { color: #777; font-size: 0.85rem; }
  .row { display: flex; gap: 0.5rem; }
  code { font-family: monospace; background: #f3f4f6; padding: 1px 5px; border-radius: 3px; }
</style>
