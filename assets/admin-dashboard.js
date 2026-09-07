window.AdminDashboard = (() => {
  let owner;
  let root;
  async function open({ uid, panel, call, esc, date }) {
    if (owner === uid && root === panel && panel.querySelector('[data-admin-workspace]')) return;
    owner = uid; root = panel;
    const input = 'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm min-w-0';
    const button = 'rounded-lg bg-ink-800/10 text-ink-800 px-3 py-2 text-sm font-semibold disabled:opacity-50';
    const categories = ['School', 'Grade', 'Locality', 'Genre', 'Club', 'Fan group'];
    panel.innerHTML = `<div data-admin-workspace class="space-y-5">
      <section><div class="flex justify-between items-center gap-3"><h3 class="font-semibold">Community health</h3><button type="button" id="admin-health-refresh" class="${button}">Refresh</button></div><p id="admin-health-time" class="text-xs text-ink-500 my-2"></p><div id="admin-health-cards" class="grid grid-cols-2 sm:grid-cols-3 gap-2"></div><p id="admin-health-error" role="status" class="text-sm text-rust-600"></p></section>
      <details open><summary class="font-semibold cursor-pointer py-2">Feedback</summary><div id="admin-feedback" class="space-y-3 pt-2"></div></details>
      <details><summary class="font-semibold cursor-pointer py-2">Circles</summary>
        <form id="admin-circle-limit" class="flex flex-wrap items-end gap-2 my-3"><label class="text-sm">Circles per reader<input aria-label="Circles per reader" type="number" min="1" max="20" required class="${input} block w-24 mt-1"></label><button class="${button}">Save limit</button><span role="status"></span></form>
        <form id="admin-circle-create" class="flex flex-wrap gap-2 my-3"><input aria-label="New circle name" placeholder="New circle name" required maxlength="60" class="${input} flex-1"><select aria-label="New circle category" class="${input}">${categories.map(c => `<option>${c}</option>`).join('')}</select><button class="${button}">Add circle</button><span role="status" class="w-full text-sm"></span></form>
        <div id="admin-circles" class="space-y-3"></div></details>
      <details><summary class="font-semibold cursor-pointer py-2">Community administrators</summary><p id="admin-names" class="text-sm py-2"></p></details>
      <details><summary class="font-semibold cursor-pointer py-2">Maintenance</summary><p class="text-sm text-ink-600 my-2">Book edits update search automatically. Rebuild only to repair missing search entries; refreshing totals recounts community activity.</p><p id="admin-maintenance-time" class="text-xs text-ink-500 my-2"></p><div class="flex flex-wrap gap-2"><button id="admin-rebuild" class="${button}">Rebuild search index</button><button id="admin-recount" class="${button}">Recount totals</button><button id="admin-stop-rebuild" hidden class="${button}">Stop after this batch</button></div><p id="admin-maintenance-status" role="status" class="text-sm mt-2"></p></details>
    </div>`;
    const workspace = panel.querySelector('[data-admin-workspace]');
    const find = selector => workspace.querySelector(selector);
    const busy = async (control, status, action) => {
      if (control.disabled) return;
      control.disabled = true; status.textContent = 'Working…';
      try { await action(); } catch (error) { status.textContent = error.message || 'Could not complete this action. Try again.'; }
      finally { control.disabled = false; }
    };
    async function health() {
      await busy(find('#admin-health-refresh'), find('#admin-health-error'), async () => {
        const data = await call('getAdminDashboard', {});
        const h = data.health || {}, totals = h.totals || {};
        const stats = [[h.activeLoans,'Active loans'],[h.overdueLoans,'Overdue loans'],[h.pendingFriendRequests,'Pending friend requests'],[h.pendingFeedback,'Awaiting reply'],[totals.totalBooks,'Books'],[totals.totalMembers,'Readers']];
        find('#admin-health-cards').innerHTML = stats.map(([value,label]) => `<div class="bg-ink-800/5 rounded-lg p-3"><p class="text-lg font-semibold">${value === null || value === undefined ? 'Unavailable' : Number(value)}</p><p class="text-xs text-ink-600">${label}</p></div>`).join('');
        find('#admin-health-time').textContent = `Checked ${new Date().toLocaleTimeString()}. Community totals updated ${date(h.totalsUpdatedAt) || 'not yet'}.`;
        const limit = find('#admin-circle-limit input');
        if (!limit.value) limit.value = data.circleLimit;
        find('#admin-names').textContent = (data.admins || []).map(a => a.name).join(', ');
        find('#admin-maintenance-time').textContent = `Last successful search rebuild: ${date(data.maintenance?.searchCompletedAt) || 'No completed run recorded'}. Totals recount: ${date(data.maintenance?.totalsCompletedAt) || 'No completed run recorded'}.`;
        find('#admin-health-error').textContent = '';
      });
    }
    find('#admin-health-refresh').onclick = health;

    function list(kind) {
      const container = find(kind === 'feedback' ? '#admin-feedback' : '#admin-circles');
      const statuses = kind === 'feedback' ? [['open','Awaiting reply'],['answered','Answered'],['resolved','Resolved'],['all','All feedback']] : [['active','Active'],['archived','Archived'],['all','All circles']];
      container.innerHTML = `<div class="flex flex-wrap gap-2"><select aria-label="${kind} status" class="${input}">${statuses.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select>${kind === 'circles' ? `<select aria-label="Circle category" class="${input}"><option value="">All categories</option>${categories.map(c=>`<option>${c}</option>`).join('')}</select>` : ''}<input aria-label="Filter this ${kind} page" placeholder="Filter this page" class="${input} flex-1"><button type="button" class="refresh ${button}">Refresh list</button></div><p class="list-status text-sm" role="status"></p><div class="rows space-y-2"></div><div class="flex items-center gap-3"><button type="button" class="previous ${button}">Previous</button><span class="page text-sm"></span><button type="button" class="next ${button}">Next</button></div>`;
      const selects = container.querySelectorAll('select');
      const filter = container.querySelector('input');
      const rows = container.querySelector('.rows');
      const status = container.querySelector('.list-status');
      let pages = [], page = 0, generation = 0, loading = false;
      const drafts = new Map();
      function render() {
        const data = pages[page] || { items: [] };
        const term = filter.value.toLowerCase();
        const items = data.items.filter(item => [item.name,item.category,item.message,item.reporterShelf].some(v=>String(v || '').toLowerCase().includes(term)));
        rows.innerHTML = items.length ? '' : '<p class="text-sm text-ink-500">No matches on this page.</p>';
        items.forEach(item => {
          const row = document.createElement('article'); row.className = 'border border-ink-200 rounded-lg p-3 text-sm';
          if (kind === 'feedback') {
            row.innerHTML = `<div class="flex flex-wrap justify-between gap-2"><strong>${esc(item.reporterShelf || 'Reader')} · ${esc(item.category || 'Feedback')}</strong><span>${esc(item.status)} · ${esc(date(item.createdAt) || '')}</span></div><p class="whitespace-pre-wrap break-words my-2">${esc(item.message || '')}</p>${item.adminReply ? `<p class="whitespace-pre-wrap break-words my-2">Reply: ${esc(item.adminReply)}</p>` : ''}<form class="space-y-2"><textarea required maxlength="1000" aria-label="Reply to ${esc(item.reporterShelf || 'reader')}" placeholder="Reply to this reader" rows="2" class="${input} w-full"></textarea><div class="flex gap-2"><button class="${button}">Send reply</button><button type="button" class="resolve ${button}">${item.status === 'resolved' ? 'Reopen' : 'Resolve'}</button></div></form><p role="status" class="mt-2"></p>`;
            const form = row.querySelector('form'), note = row.querySelector('[role="status"]');
            form.querySelector('textarea').value = drafts.get(item.id) || '';
            form.querySelector('textarea').oninput = event => drafts.set(item.id,event.target.value);
            const updateStatus = () => { row.querySelector('span').textContent=`${item.status} · ${date(item.createdAt) || ''}`; };
            form.onsubmit = event => { event.preventDefault(); const reply = form.querySelector('textarea').value.trim(); if (!reply) return; busy(form.querySelector('button'), note, async () => { await call('replyToFeedback',{feedbackId:item.id,reply}); item.status='answered'; item.adminReply=reply; updateStatus(); note.textContent='Reply sent. This item is now in Answered.'; form.querySelector('textarea').value=''; drafts.delete(item.id); }); };
            row.querySelector('.resolve').onclick = event => busy(event.currentTarget,note,async()=> { const next=item.status==='resolved'?'open':'resolved'; await call('resolveFeedback',{feedbackId:item.id,status:next}); item.status=next; updateStatus(); row.querySelector('.resolve').textContent=next==='resolved'?'Reopen':'Resolve'; note.textContent=`Marked ${next}. Refresh the list to update this queue.`; });
          } else {
            row.innerHTML = `<div class="flex justify-between items-center gap-2"><span class="break-words min-w-0"><strong>${esc(item.name)}</strong> · ${esc(item.category)}</span>${item.active ? `<button class="${button}">Archive</button>` : '<span>Archived</span>'}</div><p role="status" class="text-xs"></p>`;
            const control=row.querySelector('button');
            if(control) control.onclick=()=>busy(control,row.querySelector('[role="status"]'),async()=>{await call('archiveCircle',{circleId:item.id});item.active=false;control.remove();row.querySelector('[role="status"]').textContent='Archived. Existing memberships are kept; new joins are closed.';});
          }
          rows.appendChild(row);
        });
        container.querySelector('.previous').disabled=loading || page===0;
        container.querySelector('.next').disabled=loading || !data.next;
        container.querySelector('.page').textContent=`Page ${page+1}`;
      }
      async function load(index=0,reset=false) {
        const token=++generation;
        if(reset) { pages=[]; page=0; }
        loading=true; status.textContent='Loading…'; render();
        try {
          const result = pages[index] || await call('getAdminItems',{kind,status:selects[0].value,category:selects[1]?.value || '',after:index ? pages[index-1].next : null});
          if(token!==generation) return;
          pages[index]=result;
          page=index; status.textContent='';
        } catch(error) { if(token===generation) status.textContent=error.message || 'Unable to load. Try Refresh list.'; }
        finally { if(token===generation) {loading=false;render();} }
      }
      selects.forEach(select=>select.onchange=()=>load(0,true));
      filter.oninput=render;
      container.querySelector('.refresh').onclick=()=>load(0,true);
      container.querySelector('.previous').onclick=()=>load(page-1);
      container.querySelector('.next').onclick=()=>load(page+1);
      if(kind === 'feedback') load();
      else container.closest('details').addEventListener('toggle', () => { if(container.closest('details').open && !pages.length && !loading) load(); });
    }
    list('feedback'); list('circles'); health();
    const limitForm=find('#admin-circle-limit');
    limitForm.onsubmit=event=>{event.preventDefault();busy(limitForm.querySelector('button'),limitForm.querySelector('[role="status"]'),async()=>{await call('updateCircleSettings',{circleLimit:Number(limitForm.querySelector('input').value)});limitForm.querySelector('[role="status"]').textContent='Limit saved.';});};
    const createForm=find('#admin-circle-create');
    createForm.onsubmit=event=>{event.preventDefault();busy(createForm.querySelector('button'),createForm.querySelector('[role="status"]'),async()=>{await call('createCircle',{name:createForm.querySelector('input').value.trim(),category:createForm.querySelector('select').value});createForm.querySelector('input').value='';createForm.querySelector('[role="status"]').textContent='Circle added. Refresh the circle list to see it.';});};
    let stopRebuild=false;
    find('#admin-stop-rebuild').onclick=()=>{stopRebuild=true;find('#admin-stop-rebuild').disabled=true;};
    find('#admin-rebuild').onclick=()=>busy(find('#admin-rebuild'),find('#admin-maintenance-status'),async()=>{
      stopRebuild=false;let after=null,total=0;
      const stop=find('#admin-stop-rebuild');stop.hidden=false;stop.disabled=false;
      try {
        do {
          const result=await call('rebuildDiscoveryIndex',{after});total+=result.indexed;after=result.next;
          find('#admin-maintenance-status').textContent=`${total} books indexed${after ? '…' : '.'}`;
        } while(after && !stopRebuild);
        find('#admin-maintenance-status').textContent=after ? `Stopped after ${total} books. A new run starts from the beginning.` : `Completed ${new Date().toLocaleString()}: ${total} books indexed.`;
        if(!after) health();
      } finally {stop.hidden=true;}
    });
    find('#admin-recount').onclick=()=>busy(find('#admin-recount'),find('#admin-maintenance-status'),async()=>{await call('rebuildCommunityStats',{});find('#admin-maintenance-status').textContent=`Totals recounted ${new Date().toLocaleString()}.`;health();});
  }
  function reset() { if(root) root.replaceChildren(); owner=null; root=null; }
  return { open, reset };
})();
