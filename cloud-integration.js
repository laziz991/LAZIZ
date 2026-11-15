
/* LAZIZ Cloud Integration
   Supabase authentication, owner registration, shared cashier password,
   business workspace, catalogue, sales and business records.
*/
(function(){
  const cfg=window.LAZIZ_SUPABASE_CONFIG;

  if(!cfg?.url || !cfg?.publishableKey || !window.supabase?.createClient){
    console.error('LAZIZ Supabase configuration or client library is missing.');
    return;
  }

  const sb=window.supabase.createClient(cfg.url,cfg.publishableKey,{
    auth:{
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:true,
      storageKey:'laziz-auth-v1'
    }
  });

  window.lazizSupabase=sb;

  let cloudUser=null;
  let cloudBusinessId=null;
  let cloudRole=null;
  let busy=false;
  let pendingStaffPassword='';

  const uid=()=>crypto.randomUUID();

  const fail=e=>{
    console.error(e);
    toast(e?.message||'Something went wrong. Please try again.');
  };

  function authNotice(msg){
    return `<div class="notice">${esc(msg)}</div>`;
  }

  function validPassword(password){
    return typeof password==='string' &&
      password.length>=8 && password.length<=128;
  }

  async function saveStaffPassword(businessId,password){sb.
    const {data,error}=await sb.functions.invoke('cashier-auth',{
      body:{
        action:'setup',
        business_id:businessId,
        password
      }
    });

    if(error)throw new Error(
      data?.error || error.message || 'Could not save the shared staff password.'
    );

    if(!data?.success){
      throw new Error(data?.error||'The staff password was not saved.');
    }

    return true;
  }

  window.authForm=function(mode){

    if(mode==='forgot'){
      $('#authbox').innerHTML=`
        <h2>Reset your password</h2>
        <p class="muted">Enter your LAZIZ account email. We will send a verification code.</p>
        <form id="cloudforgot">
          <div class="field">
            <label>Email address</label>
            <input name="email" type="email" required autocomplete="email">
          </div>
          <button class="btn" ${busy?'disabled':''}>Send reset code</button>
        </form>
        <div class="auth-switch">
          <a onclick="authForm('login')">Back to sign in</a>
        </div>`;

      $('#cloudforgot').onsubmit=async e=>{
        e.preventDefault();
        if(busy)return;
        busy=true;

        const button=e.target.querySelector('button');
        button.disabled=true;
        button.textContent='SENDING CODE…';

        try{
          const f=new FormData(e.target);
          recoveryEmail=String(f.get('email')).trim().toLowerCase();

          const {error}=await sb.auth.resetPasswordForEmail(recoveryEmail);
          if(error)throw error;

          window.showRecoveryCode();
        }catch(err){
          fail(err);
        }finally{
          busy=false;
        }
      };
      return;
    }

    if(mode==='recovery-code'){
      window.showRecoveryCode();
      return;
    }

    $('#authbox').innerHTML=mode==='login'
      ? `
        <h2>Welcome back</h2>
        <p class="muted">Sign in to your LAZIZ business workspace.</p>

        <form id="cloudlogin">
          <div class="field">
            <label>Business email address</label>
            <input name="email" type="email" required autocomplete="email">
          </div>

          <div class="field">
            <label>Admin password</label>
            <input name="password" type="password" required autocomplete="current-password">
          </div>

          <button class="btn" ${busy?'disabled':''}>Sign in</button>
        </form>

        <div class="auth-switch">
          <a onclick="authForm('forgot')">Forgot password?</a>
        </div>

        <div class="auth-switch">
          New to LAZIZ?
          <a onclick="authForm('register')">Create a business account</a>
        </div>

        ${authNotice('Use your business email and admin password to access the owner dashboard.')}`
      : `
        <h2>Create your LAZIZ account</h2>
        <p class="muted">Set up your owner account and shared staff password.</p>

        <form id="cloudregister">

          <div class="field">
            <label>Owner full name</label>
            <input name="owner" required autocomplete="name">
          </div>

          <div class="field">
            <label>Business email address</label>
            <input name="email" type="email" required autocomplete="email">
          </div>

          <div class="field">
            <label>Admin password</label>
            <input name="password" type="password" minlength="8" maxlength="128" required autocomplete="new-password">
          </div>

          <div class="field">
            <label>Confirm admin password</label>
            <input name="confirm_admin" type="password" minlength="8" maxlength="128" required autocomplete="new-password">
          </div>

          <div class="field">
            <label>Shared staff password</label>
            <input name="staff_password" type="password" minlength="8" maxlength="128" required autocomplete="new-password">
          </div>

          <div class="field">
            <label>Confirm staff password</label>
            <input name="confirm_staff" type="password" minlength="8" maxlength="128" required autocomplete="new-password">
          </div>

          <button class="btn" ${busy?'disabled':''}>Create business account</button>
        </form>

        <div class="auth-switch">
          Already registered?
          <a onclick="authForm('login')">Sign in</a>
        </div>

        ${authNotice('The admin password is for the owner. The shared staff password is for authorised salesgirls using the LAZIZ Sales Counter.')}`;

    $('#cloudlogin')?.addEventListener('submit',async e=>{
      e.preventDefault();
      if(busy)return;
      busy=true;

      try{
        const f=new FormData(e.target);

        const {error}=await sb.auth.signInWithPassword({
          email:String(f.get('email')).trim().toLowerCase(),
          password:f.get('password')
        });

        if(error)throw error;

        await bootWorkspace();
      }catch(err){
        fail(err);
      }finally{
        busy=false;
      }
    });

    $('#cloudregister')?.addEventListener('submit',async e=>{
      e.preventDefault();
      if(busy)return;

      const f=new FormData(e.target);

      const owner=String(f.get('owner')).trim();
      const email=String(f.get('email')).trim().toLowerCase();
      const adminPassword=String(f.get('password'));
      const confirmAdmin=String(f.get('confirm_admin'));
      const staffPassword=String(f.get('staff_password'));
      const confirmStaff=String(f.get('confirm_staff'));

      if(!validPassword(adminPassword)){
        return toast('Admin password must contain 8 to 128 characters.');
      }

      if(adminPassword!==confirmAdmin){
        return toast('Admin passwords do not match.');
      }

      if(!validPassword(staffPassword)){
        return toast('Staff password must contain 8 to 128 characters.');
      }

      if(staffPassword!==confirmStaff){
        return toast('Staff passwords do not match.');
      }

      busy=true;

      try{
        const {data,error}=await sb.auth.signUp({
          email,
          password:adminPassword,
          options:{
  data:{
    full_name:owner
  },
  emailRedirectTo:'https://laziz991.github.io/LAZIZ/'
}
});

        if(error)throw error;

        if(data.session){
          pendingStaffPassword=staffPassword;
          await bootWorkspace();
        }else{
          pendingStaffPassword='';
          $('#authbox').innerHTML=`
            <h2>Check your email</h2>
            <p>We sent a confirmation email to <b>${esc(email)}</b>.</p>
            <p>Confirm your email, return to LAZIZ and sign in with your admin password.</p>
            <p>During business workspace setup, you will enter your shared staff password again.</p>
            <button class="btn" onclick="authForm('login')">Go to sign in</button>`;
        }
      }catch(err){
        fail(err);
      }finally{
        busy=false;
      }
    });
  };

  let recoveryEmail='';

  window.showRecoveryCode=function(){
    $('#authbox').innerHTML=`
      <h2>Enter your reset code</h2>
      <p class="muted">We sent a six-digit code to <b>${esc(recoveryEmail)}</b>.</p>

      <form id="cloudverifyrecovery">
        <div class="field">
          <label>Six-digit code</label>
          <input name="token" type="text" inputmode="numeric"
            autocomplete="one-time-code" pattern="[0-9]{6}"
            minlength="6" maxlength="6" required placeholder="000000">
        </div>
        <button class="btn">Verify code</button>
      </form>

      <div class="auth-switch">
        <a onclick="authForm('forgot')">Send another code</a> ·
        <a onclick="authForm('login')">Back to sign in</a>
      </div>`;

    $('#cloudverifyrecovery').onsubmit=async e=>{
      e.preventDefault();
      if(busy)return;
      busy=true;

      const button=e.target.querySelector('button');
      button.disabled=true;
      button.textContent='VERIFYING…';

      try{
        const f=new FormData(e.target);
        const token=String(f.get('token')).trim();

        const {error}=await sb.auth.verifyOtp({
          email:recoveryEmail,
          token,
          type:'recovery'
        });

        if(error)throw error;

        window.showNewPassword();
      }catch(err){
        fail(err);
        button.disabled=false;
        button.textContent='Verify code';
      }finally{
        busy=false;
      }
    };
  };

  window.showNewPassword=function(){
    $('#authbox').innerHTML=`
      <h2>Create a new password</h2>
      <p class="muted">Choose a new password for your LAZIZ account.</p>

      <form id="cloudnewpassword">
        <div class="field">
          <label>New password</label>
          <input name="password" type="password" minlength="8" required autocomplete="new-password">
        </div>

        <div class="field">
          <label>Confirm new password</label>
          <input name="confirm" type="password" minlength="8" required autocomplete="new-password">
        </div>

        <button class="btn">Save new password</button>
      </form>`;

    $('#cloudnewpassword').onsubmit=async e=>{
      e.preventDefault();
      if(busy)return;

      const f=new FormData(e.target);
      const password=String(f.get('password'));
      const confirmPassword=String(f.get('confirm'));

      if(!validPassword(password)){
        return toast('Your password must contain 8 to 128 characters.');
      }

      if(password!==confirmPassword){
        return toast('The passwords do not match.');
      }

      busy=true;
      const button=e.target.querySelector('button');
      button.disabled=true;
      button.textContent='SAVING…';

      try{
        const {error}=await sb.auth.updateUser({password});
        if(error)throw error;

        await sb.auth.signOut();
        recoveryEmail='';

        $('#authbox').innerHTML=`
          <h2>Password updated</h2>
          <p class="muted">Your password has been changed successfully.</p>
          <button class="btn" onclick="authForm('login')">Return to sign in</button>`;
      }catch(err){
        fail(err);
        button.disabled=false;
        button.textContent='Save new password';
      }finally{
        busy=false;
      }
    };
  };

  window.showAuth=function(mode){
    show('auth');
    authForm(mode);
  };

  async function bootWorkspace(){
    const {data:{session},error:se}=await sb.auth.getSession();
    if(se)throw se;

    if(!session?.user){
      show('landing');
      return;
    }

    cloudUser=session.user;

    const {data:membership,error}=await sb
      .from('business_members')
      .select('business_id,role')
      .eq('user_id',cloudUser.id)
      .limit(1)
      .maybeSingle();

    if(error)throw error;

    if(!membership){
      show('auth');

      const needsStaffPassword=!pendingStaffPassword;

      $('#authbox').innerHTML=`
        <h2>Create your business workspace</h2>
        <p class="muted">Enter your business details to complete registration.</p>

        <form id="workspaceform">
          <div class="field">
            <label>Business name</label>
            <input name="business" required minlength="2" placeholder="Your business name">
          </div>

          <div class="field">
            <label>Business category</label>
            <select name="industry">
              <option>Building materials & hardware</option>
              <option>Supermarket & general shop</option>
              <option>Pharmacy</option>
              <option>Fashion & boutique</option>
              <option>Electronics</option>
              <option>Wholesale & distribution</option>
              <option>Restaurant & café</option>
              <option>Hotel & hospitality</option>
              <option>Other</option>
            </select>
          </div>

          ${needsStaffPassword?`
            <div class="field">
              <label>Shared staff password</label>
              <input name="staff_password" type="password" minlength="8" maxlength="128" required autocomplete="new-password">
            </div>
            <div class="field">
              <label>Confirm staff password</label>
              <input name="confirm_staff" type="password" minlength="8" maxlength="128" required autocomplete="new-password">
            </div>
          `:`
            <div class="notice">Your staff password from registration will be saved when your workspace is created.</div>
          `}

          <button class="btn">Create my workspace</button>
        </form>`;

      $('#workspaceform').onsubmit=async e=>{
        e.preventDefault();
        if(busy)return;
        busy=true;

        try{
          const f=new FormData(e.target);

          let staffPassword=pendingStaffPassword;

          if(!staffPassword){
            staffPassword=String(f.get('staff_password'));
            const confirmation=String(f.get('confirm_staff'));

            if(!validPassword(staffPassword)){
              throw new Error('Staff password must contain 8 to 128 characters.');
            }

            if(staffPassword!==confirmation){
              throw new Error('Staff passwords do not match.');
            }
          }

          const {data,error}=await sb.rpc('create_business_workspace',{
            p_name:String(f.get('business')).trim(),
            p_industry:f.get('industry')
          });

          if(error)throw error;

          cloudBusinessId=data;
          cloudRole='owner';

          let staffSetupFailed=false;
          let staffSetupMessage='';

          try{
            await saveStaffPassword(cloudBusinessId,staffPassword);
          }catch(err){
            console.error(err);
            staffSetupFailed=true;
            staffSetupMessage=err.message;
          }

          pendingStaffPassword='';

          await loadCloudData();

          if(staffSetupFailed){
            toast('Workspace created. Set the staff password in Settings: '+staffSetupMessage);
          }else{
            toast('Business workspace and shared staff password created successfully.');
          }

        }catch(err){
          fail(err);
        }finally{
          busy=false;
        }
      };

      return;
    }

    cloudBusinessId=membership.business_id;
    cloudRole=membership.role;

    await loadCloudData();
  }

  async function loadCloudData(){
    const [
      businessRes,
      productsRes,
      salesRes,
      movesRes,
      customersRes,
      suppliersRes,
      expensesRes
    ]=await Promise.all([
      sb.from('businesses').select('*').eq('id',cloudBusinessId).single(),
      sb.from('products').select('*').eq('business_id',cloudBusinessId).eq('active',true).order('name'),
      sb.from('sales').select('*').eq('business_id',cloudBusinessId).order('created_at',{ascending:false}),
      sb.from('stock_movements').select('*').eq('business_id',cloudBusinessId).order('created_at',{ascending:false}).limit(500),
      sb.from('customers').select('*').eq('business_id',cloudBusinessId).order('name'),
      sb.from('suppliers').select('*').eq('business_id',cloudBusinessId).order('name'),
      sb.from('expenses').select('*').eq('business_id',cloudBusinessId).order('created_at',{ascending:false})
    ]);

    for(const r of [
      businessRes,productsRes,salesRes,movesRes,
      customersRes,suppliersRes,expensesRes
    ]){
      if(r.error)throw r.error;
    }

    const b=businessRes.data;

    const products=(productsRes.data||[]).map(p=>({
      id:p.id,
      name:p.name,
      sku:p.sku||'',
      category:p.category||'',
      unit:p.unit,
      cost:Number(p.cost),
      price:Number(p.price),
      qty:Number(p.quantity),
      reorder:Number(p.reorder_level),
      active:p.active
    }));

    const saleIds=(salesRes.data||[]).map(s=>s.id);
    let itemRows=[];

    if(saleIds.length){
      const {data,error}=await sb.from('sale_items').select('*').in('sale_id',saleIds);
      if(error)throw error;
      itemRows=data||[];
    }

    const sales=(salesRes.data||[]).map(s=>{
      const lines=itemRows.filter(i=>i.sale_id===s.id).map(i=>({
        productId:i.product_id,
        name:i.product_name,
        qty:Number(i.quantity),
        unit:i.unit,
        price:Number(i.unit_price),
        cost:Number(i.unit_cost)
      }));

      const cost=lines.reduce((a,l)=>a+l.qty*l.cost,0);

      return{
        id:s.id,
        receipt:s.receipt_no,
        date:s.created_at,
        customer:s.customer_name||'',
        payment:s.payment_method,
        lines,
        subtotal:Number(s.subtotal),
        discount:Number(s.discount),
        total:Number(s.total),
        profit:Number(s.total)-cost,
        refunded:s.status==='refunded'
      };
    });

    const movements=(movesRes.data||[]).map(m=>({
      id:m.id,
      date:m.created_at,
      productId:m.product_id,
      productName:products.find(p=>p.id===m.product_id)?.name||'Product',
      type:m.movement_type,
      change:Number(m.quantity_change),
      balance:Number(m.quantity_after),
      unit:products.find(p=>p.id===m.product_id)?.unit||'',
      reference:m.reference||''
    }));

    const customers=(customersRes.data||[]).map(x=>({
      id:x.id,
      name:x.name,
      phone:x.phone||'',
      email:x.email||'',
      notes:x.notes||''
    }));

    const suppliers=(suppliersRes.data||[]).map(x=>({
      id:x.id,
      name:x.name,
      phone:x.phone||'',
      email:x.email||'',
      notes:x.notes||''
    }));

    const expenses=(expensesRes.data||[]).map(x=>({
      id:x.id,
      date:x.created_at,
      description:x.description,
      category:x.category||'',
      amount:Number(x.amount),
      payment:x.payment_method||''
    }));

    const user={
      id:cloudUser.id,
      email:cloudUser.email,
      owner:cloudUser.user_metadata?.full_name||cloudUser.email,
      businessId:cloudBusinessId,
      role:cloudRole||'owner'
    };

    db={
      users:[user],
      businesses:{
        [cloudBusinessId]:{
          id:cloudBusinessId,
          name:b.name,
          industry:b.industry,
          currency:b.currency||'NGN',
          products,
          customers,
          suppliers,
          sales,
          expenses,
          stockMovements:movements,
          notifications:[]
        }
      }
    };

    current=user;
    localStorage.setItem('laziz_cloud_business',cloudBusinessId);

    show('app');
    openApp();
  }

  window.openApp=function(){
    show('app');
    $$('.navbtn[data-page]').forEach(b=>{
      b.onclick=()=>navigate(b.dataset.page);
    });
    navigate('dashboard');
    refreshAlerts(false);
  };

  window.logout=async function(){
    await sb.auth.signOut();
    cloudUser=null;
    cloudBusinessId=null;
    cloudRole=null;
    current=null;
    cart=[];
    show('landing');
  };

  window.checkout=async function(){
    if(!cart.length)return toast('Add at least one product');

    const b=biz();
    const subtotal=cart.reduce((a,l)=>
      a+b.products.find(p=>p.id===l.id).price*l.qty,0
    );

    const discount=Number($('#posdiscount').value||0);

    if(!Number.isFinite(discount)||discount<0||discount>subtotal){
      return toast('Discount must be between ₦0 and the subtotal');
    }

    const transactionId=uid();
    const receiptNo='LZ-'+Date.now().toString().slice(-8);

    try{
      const {data,error}=await sb.rpc('create_sale_atomic',{
        p_business_id:cloudBusinessId,
        p_receipt_no:receiptNo,
        p_customer_name:$('#poscustomer').value,
        p_payment_method:$('#payment').value,
        p_discount:discount,
        p_client_transaction_id:transactionId,
        p_items:cart.map(l=>({
          product_id:l.id,
          quantity:l.qty
        })),
        p_source:'online'
      });

      if(error)throw error;

      const {data:sr,error:se}=await sb.from('sales').select('*').eq('id',data).single();
      if(se)throw se;

      const {data:ir,error:ie}=await sb.from('sale_items').select('*').eq('sale_id',data);
      if(ie)throw ie;

      const lines=(ir||[]).map(i=>({
        productId:i.product_id,
        name:i.product_name,
        qty:Number(i.quantity),
        unit:i.unit,
        price:Number(i.unit_price),
        cost:Number(i.unit_cost)
      }));

      const s={
        id:sr.id,
        receipt:sr.receipt_no,
        date:sr.created_at,
        customer:sr.customer_name||'',
        payment:sr.payment_method,
        lines,
        subtotal:Number(sr.subtotal),
        discount:Number(sr.discount),
        total:Number(sr.total),
        profit:Number(sr.total)-lines.reduce((a,l)=>a+l.qty*l.cost,0)
      };

      cart=[];
      await loadCloudData();
      receipt(s);
      toast('Sale saved securely to LAZIZ cloud');
    }catch(err){
      fail(err);
    }
  };

  window.productModal=function(id){
    const p=biz().products.find(x=>x.id===id)||{
      name:'',
      sku:'',
      category:'',
      unit:'',
      cost:'',
      price:'',
      qty:'',
      reorder:''
    };

    modal(`
      <h2>${id?'Edit product':'Add a product'}</h2>

      <form id="cloudproductform" class="form-grid">
        <div class="field">
          <label>Product name</label>
          <input name="name" required value="${esc(p.name)}">
        </div>

        <div class="field">
          <label>SKU / product code</label>
          <input name="sku" value="${esc(p.sku)}">
        </div>

        <div class="field">
          <label>Category</label>
          <input name="category" required value="${esc(p.category)}">
        </div>

        <div class="field">
          <label>Unit of measure</label>
          <select name="unit" required>
            <option value="" disabled ${!p.unit?'selected':''}>Choose unit</option>
            ${['piece','bag','tonne','kg','metre','length','sheet','bundle','carton','box','bucket','litre','roll','pack','set','dozen','unit'].map(x=>`<option ${p.unit===x?'selected':''}>${x}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Purchase cost (₦)</label>
          <input name="cost" type="number" min="0" step=".01" required value="${p.cost}">
        </div>

        <div class="field">
          <label>Selling price (₦)</label>
          <input name="price" type="number" min="0" step=".01" required value="${p.price}">
        </div>

        <div class="field">
          <label>Quantity in stock</label>
          <input name="qty" type="number" min="0" step=".001" required value="${p.qty}">
        </div>

        <div class="field">
          <label>Low-stock alert at</label>
          <input name="reorder" type="number" min="0" step=".001" required value="${p.reorder}">
        </div>

        <div class="modal-actions wide">
          <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
          <button class="btn">Save to cloud</button>
        </div>
      </form>`);

    $('#cloudproductform').onsubmit=async e=>{
      e.preventDefault();

      const f=new FormData(e.target);

      const payload={
        business_id:cloudBusinessId,
        name:String(f.get('name')).trim(),
        sku:String(f.get('sku')).trim()||null,
        category:String(f.get('category')).trim(),
        unit:f.get('unit'),
        cost:Number(f.get('cost')),
        price:Number(f.get('price')),
        quantity:Number(f.get('qty')),
        reorder_level:Number(f.get('reorder')),
        active:true,
        updated_at:new Date().toISOString()
      };

      try{
        let old=Number(p.qty||0);
        let res;

        if(id){
          res=await sb.from('products')
            .update(payload)
            .eq('id',id)
            .eq('business_id',cloudBusinessId)
            .select()
            .single();
        }else{
          res=await sb.from('products').insert(payload).select().single();
        }

        if(res.error)throw res.error;

        const diff=payload.quantity-old;

        if(diff!==0){
          const {error}=await sb.from('stock_movements').insert({
            business_id:cloudBusinessId,
            product_id:res.data.id,
            movement_type:id?'adjustment':'opening_stock',
            quantity_change:diff,
            quantity_after:payload.quantity,
            reference:'Product form',
            actor_id:cloudUser.id
          });

          if(error)throw error;
        }

        closeModal();
        await loadCloudData();
        navigate('products');
        toast('Product saved to cloud');
      }catch(err){
        fail(err);
      }
    };
  };

  window.deleteProduct=async function(id){
    if(!confirm('Deactivate this product? Its historical sale records will be kept.'))return;

    const {error}=await sb.from('products')
      .update({active:false,updated_at:new Date().toISOString()})
      .eq('id',id)
      .eq('business_id',cloudBusinessId);

    if(error)return fail(error);

    await loadCloudData();
    navigate('products');
    toast('Product deactivated');
  };

  window.settings=function(){
    const b=biz();
    const ownerCanManage=cloudRole==='owner';

    $('#main').innerHTML=head(
      'Business settings',
      'Manage your cloud workspace and staff access.'
    )+`
      <div class="panel" style="max-width:650px">

        <h3>Business profile</h3>

        <form id="settingsform">
          <div class="field">
            <label>Business name</label>
            <input name="name" value="${esc(b.name)}" required>
          </div>

          <div class="field">
            <label>Business category</label>
            <input name="industry" value="${esc(b.industry)}" required>
          </div>

          <button class="btn">Save settings</button>
        </form>

        ${ownerCanManage?`
          <hr style="border:0;border-top:1px solid #e5ebe6;margin:22px 0">

          <h3>Shared staff password</h3>
          <p class="muted">
            Set or change the password authorised salesgirls use to access the LAZIZ Sales Counter.
            This does not change your admin password.
          </p>

          <form id="staffpasswordform">
            <div class="field">
              <label>New shared staff password</label>
              <input name="password" type="password" minlength="8" maxlength="128" required autocomplete="new-password">
            </div>

            <div class="field">
              <label>Confirm shared staff password</label>
              <input name="confirm" type="password" minlength="8" maxlength="128" required autocomplete="new-password">
            </div>

            <button class="btn">Save staff password</button>
          </form>
        `:''}

        <div class="notice">
          Products, stock, online sales and business records remain stored in Supabase.
          Staff access is restricted to cashier permissions.
        </div>
      </div>`;

    $('#settingsform').onsubmit=async e=>{
      e.preventDefault();

      const f=new FormData(e.target);

      const {error}=await sb.from('businesses')
        .update({
          name:String(f.get('name')).trim(),
          industry:String(f.get('industry')).trim()
        })
        .eq('id',cloudBusinessId);

      if(error)return fail(error);

      await loadCloudData();
      navigate('settings');
      toast('Business profile updated');
    };

    $('#staffpasswordform')?.addEventListener('submit',async e=>{
      e.preventDefault();

      if(cloudRole!=='owner'){
        return toast('Only the business owner can change the staff password.');
      }

      if(busy)return;

      const f=new FormData(e.target);
      const password=String(f.get('password'));
      const confirmation=String(f.get('confirm'));

      if(!validPassword(password)){
        return toast('Staff password must contain 8 to 128 characters.');
      }

      if(password!==confirmation){
        return toast('Staff passwords do not match.');
      }

      busy=true;

      const button=e.target.querySelector('button');
      button.disabled=true;
      button.textContent='SAVING…';

      try{
        await saveStaffPassword(cloudBusinessId,password);
        e.target.reset();
        toast('Shared staff password saved successfully.');
      }catch(err){
        fail(err);
      }finally{
        busy=false;
        button.disabled=false;
        button.textContent='Save staff password';
      }
    });
  };

  window.personModal=function(type){
    if(!['customers','suppliers'].includes(type))return;

    const label=type==='customers'?'Customer':'Supplier';

    modal(`
      <h2>Add ${label.toLowerCase()}</h2>
      <form id="cloudpersonform">
        <div class="field">
          <label>${label} name</label>
          <input name="name" required>
        </div>

        <div class="field">
          <label>Phone</label>
          <input name="phone">
        </div>

        <div class="field">
          <label>Email</label>
          <input name="email" type="email">
        </div>

        <div class="field">
          <label>Address / notes</label>
          <textarea name="notes" rows="3"></textarea>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
          <button class="btn">Save to cloud</button>
        </div>
      </form>`);

    $('#cloudpersonform').onsubmit=async e=>{
      e.preventDefault();

      const f=new FormData(e.target);

      const payload={
        business_id:cloudBusinessId,
        name:String(f.get('name')).trim(),
        phone:String(f.get('phone')).trim()||null,
        email:String(f.get('email')).trim()||null,
        notes:String(f.get('notes')).trim()||null
      };

      try{
        const {error}=await sb.from(type).insert(payload);
        if(error)throw error;

        closeModal();
        await loadCloudData();
        navigate(type);
        toast(label+' saved to cloud');
      }catch(err){
        fail(err);
      }
    };
  };

  window.deletePerson=async function(type,id){
    if(!['customers','suppliers'].includes(type))return;

    if(!confirm('Delete this '+(type==='customers'?'customer':'supplier')+' record?'))return;

    try{
      const {error}=await sb.from(type)
        .delete()
        .eq('id',id)
        .eq('business_id',cloudBusinessId);

      if(error)throw error;

      await loadCloudData();
      navigate(type);
      toast('Record deleted');
    }catch(err){
      fail(err);
    }
  };

  window.expenseModal=function(){
    modal(`
      <h2>Record expense</h2>
      <form id="cloudexpenseform">
        <div class="field">
          <label>Description</label>
          <input name="description" required>
        </div>

        <div class="field">
          <label>Category</label>
          <select name="category">
            <option>Rent</option>
            <option>Transport</option>
            <option>Utilities</option>
            <option>Salaries</option>
            <option>Repairs</option>
            <option>Purchases</option>
            <option>Other</option>
          </select>
        </div>

        <div class="field">
          <label>Amount (₦)</label>
          <input name="amount" type="number" min="0.01" step=".01" required>
        </div>

        <div class="field">
          <label>Payment method</label>
          <select name="payment">
            <option>Cash</option>
            <option>Bank transfer</option>
            <option>POS / Card</option>
          </select>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
          <button class="btn">Save to cloud</button>
        </div>
      </form>`);

    $('#cloudexpenseform').onsubmit=async e=>{
      e.preventDefault();

      const f=new FormData(e.target);
      const amount=Number(f.get('amount'));

      if(!Number.isFinite(amount)||amount<=0){
        return toast('Enter an amount greater than zero');
      }

      const payload={
        business_id:cloudBusinessId,
        description:String(f.get('description')).trim(),
        category:f.get('category'),
        amount,
        payment_method:f.get('payment'),
        actor_id:cloudUser.id
      };

      try{
        const {error}=await sb.from('expenses').insert(payload);
        if(error)throw error;

        closeModal();
        await loadCloudData();
        navigate('expenses');
        toast('Expense saved to cloud');
      }catch(err){
        fail(err);
      }
    };
  };

  window.refundSale=function(){
    toast('Cloud refunds are not enabled yet. No refund or stock change was made.');
  };

  sb.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT'){
      show('landing');
    }
  });

  bootWorkspace().catch(err=>{
    fail(err);
    show('landing');
  });

})();
