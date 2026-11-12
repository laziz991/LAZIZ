REPLACE ONLY the existing window.settings=function(){ ... }; block in cloud-integration.js with this complete function:

window.settings=function(){
  const b=biz();
  const ownerCanManage=cloudRole==='owner';
  $('#main').innerHTML=head('Business settings','Manage your cloud workspace and staff connection.')
    +`<div class="panel" style="max-width:650px">
      <h3>Business profile</h3>
      <form id="settingsform">
        <div class="field"><label>Business name</label><input name="name" value="${esc(b.name)}" required></div>
        <div class="field"><label>Business category</label><input name="industry" value="${esc(b.industry)}" required></div>
        <button class="btn">Save settings</button>
      </form>
      ${ownerCanManage?`<hr style="border:0;border-top:1px solid #e5ebe6;margin:22px 0">
      <h3>Salesgirl connection code</h3>
      <p class="muted">Generate a code and give it only to salesgirls you authorise. Each salesgirl uses this code to create her own username and password on the LAZIZ Sales Counter.</p>
      <button id="generate-staff-code" class="btn" type="button">Generate / replace connection code</button>
      <div id="staff-code-result" class="notice" style="display:none;overflow-wrap:anywhere"></div>
      <p class="muted" style="font-size:12px">A new code replaces the previous code. Existing staff will need the new code for their next online sign-in. Keep the code private.</p>`:''}
      <div class="notice">Products, stock, online sales and business records remain stored in Supabase. Staff accounts are individual and have cashier-only access.</div>
    </div>`;

  $('#settingsform').onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    const {error}=await sb.from('businesses')
      .update({name:String(f.get('name')).trim(),industry:String(f.get('industry')).trim()})
      .eq('id',cloudBusinessId);
    if(error)return fail(error);
    await loadCloudData();
    navigate('settings');
    toast('Business profile updated');
  };

  $('#generate-staff-code')?.addEventListener('click',async e=>{
    const button=e.currentTarget;
    const output=$('#staff-code-result');
    if(cloudRole!=='owner')return toast('Only the business owner can generate this code.');
    if(busy)return;
    busy=true;button.disabled=true;button.textContent='GENERATING…';
    output.style.display='none';output.textContent='';
    try{
      const {data,error}=await sb.functions.invoke('cashier-auth',{
        body:{action:'generate_code',business_id:cloudBusinessId}
      });
      if(error)throw new Error(data?.error||error.message||'Could not generate the connection code.');
      if(!data?.success||!data.connection_code)throw new Error(data?.error||'The server did not return a connection code.');
      output.style.display='block';
      output.textContent='BUSINESS CONNECTION CODE: '+data.connection_code+' — Copy this code and give it to your authorised salesgirls. It will not be shown again after you leave this page.';
      toast('New business connection code generated.');
    }catch(err){fail(err)}
    finally{busy=false;button.disabled=false;button.textContent='Generate / replace connection code'}
  });
};

IMPORTANT:
- Keep the final semicolon after the function.
- Do not replace any other part of cloud-integration.js.
- The owner must be signed in to generate the code.
