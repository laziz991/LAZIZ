// Copy this to supabase-config.js only after creating your own Supabase project.
// Use the Project URL and publishable/anon key from Supabase Project Settings > API.
// NEVER put the service_role key or a database password in browser code or GitHub.
window.LAZIZ_SUPABASE_CONFIG = {
  url: 'https://YOUR-PROJECT-REF.supabase.co',
  anonKey: 'YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY'
};
<!-- LAZIZ Supabase cloud integration -->
<script src="supabase-config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="cloud-integration.js"></script>
</body>
</html>
