(function () {
  'use strict';

  const statusNode = document.getElementById('digestAdminStatus');
  const controlsNode = document.getElementById('digestAdminControls');
  const previewButton = document.getElementById('previewDigest');
  const sendButton = document.getElementById('sendTestDigest');
  const subjectNode = document.getElementById('digestSubject');
  const snapshotNode = document.getElementById('digestSnapshot');
  const previewNode = document.getElementById('digestPreview');
  let currentSnapshotId = '';
  let client = null;

  function show(message) {
    statusNode.textContent = message;
  }

  function setBusy(busy) {
    previewButton.disabled = busy;
    sendButton.disabled = busy || !currentSnapshotId;
  }

  function renderPreview(result) {
    currentSnapshotId = String(result.snapshotId || '');
    subjectNode.textContent = String(result.subject || 'Weekly digest preview');
    snapshotNode.textContent = currentSnapshotId ? `Snapshot ${currentSnapshotId}` : '';
    previewNode.replaceChildren();
    for (const deal of Array.isArray(result.deals) ? result.deals : []) {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = String(deal.title || 'Untitled game');
      const details = document.createElement('span');
      const price = Number(deal.salePrice);
      const score = Number(deal.dealScore);
      details.textContent = ` — ${Number.isFinite(price) ? `$${price.toFixed(2)}` : 'Price unavailable'} at ${String(deal.storeName || 'Store unavailable')} · Deal Score ${Number.isFinite(score) ? Math.round(score) : '—'}`;
      const reason = document.createElement('p');
      reason.className = 'account-muted';
      reason.textContent = String(deal.recommendation || '');
      item.append(title, details, reason);
      previewNode.appendChild(item);
    }
    sendButton.disabled = previewNode.children.length !== 5;
  }

  async function invoke(action) {
    setBusy(true);
    const result = await client.functions.invoke('digest-admin', { body: { action } });
    if (result.error) {
      let message = 'The digest tool is unavailable right now.';
      try {
        const responseBody = await result.error.context.json();
        if (responseBody && typeof responseBody.error === 'string') message = responseBody.error;
      } catch (_) {
        // Keep the fixed fallback.
      }
      throw new Error(message);
    }
    renderPreview(result.data || {});
    setBusy(false);
    return result.data || {};
  }

  async function start() {
    if (!window.LootRadarAuthNav) {
      show('Account access is unavailable right now.');
      return;
    }
    client = window.LootRadarAuthNav.clientFor(window);
    const sessionResult = client ? await client.auth.getSession() : null;
    const session = sessionResult?.data?.session || null;
    if (!session?.user) {
      window.location.replace('/login.html?next=%2Fdigest-admin.html');
      return;
    }
    controlsNode.hidden = false;
    show('Ready to build a private preview.');

    previewButton.addEventListener('click', async function () {
      try {
        await invoke('preview');
        show('Preview built from the current qualified deals.');
      } catch (error) {
        currentSnapshotId = '';
        setBusy(false);
        show(error instanceof Error ? error.message : 'The preview could not be built.');
      }
    });

    sendButton.addEventListener('click', async function () {
      if (!window.confirm('Send this digest to your signed-in account email?')) return;
      try {
        const result = await invoke('send_test');
        show(result.delivered ? 'Test digest accepted for delivery.' : 'The test digest was not sent.');
      } catch (error) {
        setBusy(false);
        show(error instanceof Error ? error.message : 'The test digest could not be sent.');
      }
    });
  }

  start().catch(function () {
    show('The digest tool is unavailable right now.');
  });
})();
