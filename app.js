/* ========================================
   NIGHT OWL VPN — APP.JS
   Supabase Integration & Business Logic
   ======================================== */

// ===================== STEP 1: CONFIGURATION =====================
// ⚠️ REPLACE THESE VALUES WITH YOUR SUPABASE PROJECT CREDENTIALS
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-public-key';
const ADMIN_EMAIL = 'your-admin-email@gmail.com'; // Your Google account email
const WHATSAPP_NUMBER = '94724212983';

// Initialize Supabase Client
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global State
let currentUser = null;
let isAdmin = false;

// ===================== STEP 2: AUTHENTICATION =====================

async function signInWithGoogle() {
    showToast('Redirecting to Google...', 'info');
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + window.location.pathname
        }
    });
    if (error) {
        showToast('Login failed: ' + error.message, 'error');
        console.error('Auth error:', error);
    }
}

async function signOut() {
    await supabaseClient.auth.signOut();
    currentUser = null;
    isAdmin = false;
    window.location.href = 'index.html';
}

// Auth State Listener
supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
        currentUser = session.user;
        isAdmin = currentUser.email === ADMIN_EMAIL;
        updateUIForAuth();
        
        if (document.getElementById('dashboard')) {
            loadUserData();
        }
        if (document.getElementById('admin-stats')) {
            initAdminPanel();
        }
    } else {
        currentUser = null;
        isAdmin = false;
        updateUIForAuth();
    }
});

// Check session on load
(async function initAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) {
        currentUser = session.user;
        isAdmin = currentUser.email === ADMIN_EMAIL;
        updateUIForAuth();
        
        if (document.getElementById('dashboard')) {
            loadUserData();
        }
        if (document.getElementById('admin-stats')) {
            initAdminPanel();
        }
    }
})();

// ===================== STEP 3: UI UPDATES =====================

function updateUIForAuth() {
    const loginBtn = document.getElementById('login-btn');
    const userMenu = document.getElementById('user-menu');
    const authGate = document.getElementById('auth-gate');
    const dashboard = document.getElementById('dashboard');
    const adminLink = document.getElementById('admin-link');
    const mobileAuth = document.getElementById('mobile-auth');

    if (currentUser) {
        // Navbar
        if (loginBtn) loginBtn.classList.add('hidden');
        if (userMenu) {
            userMenu.classList.remove('hidden');
            document.getElementById('user-email').textContent = currentUser.email;
        }
        if (adminLink) {
            adminLink.classList.toggle('hidden', !isAdmin);
        }
        
        // Mobile menu auth
        if (mobileAuth) {
            mobileAuth.innerHTML = `
                <span style="color:var(--neon-cyan)">${currentUser.email}</span>
                ${isAdmin ? '<a href="admin.html">Admin Panel</a>' : ''}
                <button onclick="signOut()" class="btn-outline">Logout</button>
            `;
        }

        // Dashboard sections
        if (authGate) authGate.classList.add('hidden');
        if (dashboard) {
            dashboard.classList.remove('hidden');
            const displayName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
            const nameEl = document.getElementById('display-name');
            if (nameEl) nameEl.textContent = displayName;
        }
    } else {
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (userMenu) userMenu.classList.add('hidden');
        if (authGate) authGate.classList.remove('hidden');
        if (dashboard) dashboard.classList.add('hidden');
        if (adminLink) adminLink.classList.add('hidden');
        
        if (mobileAuth) {
            mobileAuth.innerHTML = `<button onclick="signInWithGoogle()" class="btn-primary"><i class="fab fa-google"></i> Login</button>`;
        }
    }
}

// ===================== STEP 4: ORDER FORM =====================

function scrollToOrder(packageName) {
    const orderSection = document.getElementById('order');
    orderSection.scrollIntoView({ behavior: 'smooth' });
    
    if (!currentUser) {
        showToast('Please login first to place an order!', 'error');
        return;
    }
    
    // Pre-select package
    const select = document.getElementById('package-select');
    if (select) {
        select.value = packageName;
    }
}

function handleSimChange() {
    const simSelect = document.getElementById('sim-package');
    const deviceField = document.getElementById('device-id-field');
    const deviceInput = document.querySelector('input[name="device-id"]');
    
    if (simSelect.value === 'Mobitel SIM - 222 Zoom Package') {
        deviceField.classList.remove('hidden');
        deviceInput.setAttribute('required', 'required');
    } else {
        deviceField.classList.add('hidden');
        deviceInput.removeAttribute('required');
        deviceInput.value = '';
    }
}

// File Upload Handlers
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length) {
        document.getElementById('payment-slip').files = files;
        handleFileSelect(document.getElementById('payment-slip'));
    }
}

function handleFileSelect(input) {
    const preview = document.getElementById('file-preview');
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        preview.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span><strong>${file.name}</strong> (${sizeMB} MB)</span>
        `;
        preview.classList.remove('hidden');
    }
}

// Main Order Submission
async function handleOrderSubmit(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showToast('Please login first!', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    
    // Show loading
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    submitBtn.disabled = true;
    
    try {
        const formData = new FormData(e.target);
        const file = formData.get('payment-slip');
        
        if (!file || file.size === 0) {
            throw new Error('Please upload a payment slip');
        }
        
        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            throw new Error('File size must be less than 5MB');
        }
        
        // 1. Upload payment slip to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `slips/${currentUser.id}/${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('slips')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });
            
        if (uploadError) throw uploadError;
        
        // 2. Get public URL
        const { data: { publicUrl } } = supabaseClient.storage
            .from('slips')
            .getPublicUrl(fileName);
            
        // 3. Save order to database
        const orderData = {
            user_id: currentUser.id,
            first_name: formData.get('first-name').trim(),
            last_name: formData.get('last-name').trim(),
            package_type: formData.get('package'),
            sim_package: formData.get('sim-package'),
            device_id: formData.get('device-id') || null,
            slip_url: publicUrl,
            status: 'pending'
        };
        
        const { error: dbError } = await supabaseClient
            .from('orders')
            .insert([orderData]);
            
        if (dbError) throw dbError;
        
        // 4. Format WhatsApp message
        const message = `*🦉 NEW NIGHT OWL VPN ORDER* %0A%0A` +
            `*Name:* ${orderData.first_name} ${orderData.last_name}%0A` +
            `*Email:* ${currentUser.email}%0A` +
            `*Package:* ${orderData.package_type}%0A` +
            `*Network:* ${orderData.sim_package}%0A` +
            `*Device ID:* ${orderData.device_id || 'N/A'}%0A` +
            `*Payment Slip:* ${publicUrl}%0A%0A` +
            `_Submitted via Night Owl VPN Website_`;
            
        // 5. Show success and redirect
        showToast('Order submitted! Opening WhatsApp...', 'success');
        
        setTimeout(() => {
            window.location.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;
        }, 1500);
        
    } catch (error) {
        console.error('Order error:', error);
        showToast(error.message || 'Failed to submit order. Please try again.', 'error');
    } finally {
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
        submitBtn.disabled = false;
    }
}

// ===================== STEP 5: USER DASHBOARD DATA =====================

async function loadUserData() {
    if (!currentUser) return;
    
    // Load orders
    const { data: orders, error: ordersError } = await supabaseClient
        .from('orders')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
        
    if (!ordersError && orders) {
        renderOrders(orders);
    }
    
    // Load configs
    const { data: configs, error: configsError } = await supabaseClient
        .from('configs')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
        
    if (!configsError && configs) {
        renderConfigs(configs);
    }
}

function renderOrders(orders) {
    const container = document.getElementById('orders-list');
    if (!container) return;
    
    if (orders.length === 0) {
        container.innerHTML = '<p class="empty-state">No orders yet. Place your first order above!</p>';
        return;
    }
    
    container.innerHTML = orders.map(order => `
        <div class="order-item">
            <div class="order-info">
                <h4>${order.package_type}</h4>
                <p>${order.sim_package} • ${new Date(order.created_at).toLocaleDateString()}</p>
            </div>
            <span class="order-status status-${order.status}">${order.status.toUpperCase()}</span>
        </div>
    `).join('');
}

function renderConfigs(configs) {
    const container = document.getElementById('configs-list');
    if (!container) return;
    
    if (configs.length === 0) {
        container.innerHTML = '<p class="empty-state">No config files available yet. Admin will upload them after verification.</p>';
        return;
    }
    
    container.innerHTML = configs.map(config => `
        <div class="config-item">
            <div class="order-info">
                <h4><i class="fas fa-file-code"></i> ${config.file_name}</h4>
                <p>Uploaded ${new Date(config.created_at).toLocaleDateString()}</p>
            </div>
            <a href="${config.file_url}" target="_blank" download>
                <i class="fas fa-download"></i> Download
            </a>
        </div>
    `).join('');
}

// ===================== STEP 6: ADMIN PANEL =====================

async function initAdminPanel() {
    // Verify admin
    if (!isAdmin) {
        showToast('Access denied. Admins only.', 'error');
        window.location.href = 'index.html';
        return;
    }
    
    document.getElementById('admin-email').textContent = currentUser.email;
    loadStats();
    loadUsers();
    loadOrders();
    loadAllConfigs();
}

function showTab(tabName) {
    document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav a').forEach(link => link.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.target.classList.add('active');
}

async function loadStats() {
    // Users count
    const { count: userCount } = await supabaseClient
        .from('profiles')
        .select('*', { count: 'exact', head: true });
        
    // Orders count
    const { count: orderCount } = await supabaseClient
        .from('orders')
        .select('*', { count: 'exact', head: true });
        
    // Pending orders
    const { count: pendingCount } = await supabaseClient
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
        
    // Configs count
    const { count: configCount } = await supabaseClient
        .from('configs')
        .select('*', { count: 'exact', head: true });
    
    if (document.getElementById('stat-users')) {
        document.getElementById('stat-users').textContent = userCount || 0;
        document.getElementById('stat-orders').textContent = orderCount || 0;
        document.getElementById('stat-pending').textContent = pendingCount || 0;
        document.getElementById('stat-configs').textContent = configCount || 0;
    }
}

async function loadUsers() {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '<tr><td colspan="4" class="loading-cell"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    
    const { data: users, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
        
    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="loading-cell">Error: ${error.message}</td></tr>`;
        return;
    }
    
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading-cell">No users found</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.email}</td>
            <td>${user.full_name || 'N/A'}</td>
            <td>${new Date(user.created_at).toLocaleDateString()}</td>
            <td>
                <button class="btn-action" onclick="openUploadModal('${user.id}', '${user.email}')">
                    <i class="fas fa-upload"></i> Upload Config
                </button>
            </td>
        </tr>
    `).join('');
}

async function loadOrders() {
    const tbody = document.getElementById('orders-table-body');
    tbody.innerHTML = '<tr><td colspan="9" class="loading-cell"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    
    const { data: orders, error } = await supabaseClient
        .from('orders')
        .select('*, profiles(email)')
        .order('created_at', { ascending: false });
        
    if (error) {
        tbody.innerHTML = `<tr><td colspan="9" class="loading-cell">Error: ${error.message}</td></tr>`;
        return;
    }
    
    if (!orders || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading-cell">No orders found</td></tr>';
        return;
    }
    
    tbody.innerHTML = orders.map(order => `
        <tr>
            <td>${order.profiles?.email || 'N/A'}</td>
            <td>${order.first_name} ${order.last_name}</td>
            <td>${order.package_type}</td>
            <td>${order.sim_package}</td>
            <td>${order.device_id || '-'}</td>
            <td><span class="order-status status-${order.status}">${order.status}</span></td>
            <td><a href="${order.slip_url}" target="_blank" class="btn-view"><i class="fas fa-eye"></i> View</a></td>
            <td>${new Date(order.created_at).toLocaleDateString()}</td>
            <td>
                <button class="btn-action" onclick="openUploadModal('${order.user_id}', '${order.profiles?.email || 'User'}')">
                    <i class="fas fa-upload"></i> Config
                </button>
            </td>
        </tr>
    `).join('');
}

async function loadAllConfigs() {
    const tbody = document.getElementById('configs-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4" class="loading-cell"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    
    const { data: configs, error } = await supabaseClient
        .from('configs')
        .select('*, profiles(email, full_name)')
        .order('created_at', { ascending: false });
        
    if (error || !configs) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading-cell">No configs found</td></tr>';
        return;
    }
    
    tbody.innerHTML = configs.map(config => `
        <tr>
            <td>${config.profiles?.email || 'Unknown'}</td>
            <td>${config.file_name}</td>
            <td><a href="${config.file_url}" target="_blank" class="btn-view"><i class="fas fa-download"></i> Download</a></td>
            <td>${new Date(config.created_at).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

// Modal Functions
function openUploadModal(userId, userEmail) {
    document.getElementById('target-user-id').value = userId;
    document.getElementById('target-user-email').textContent = userEmail;
    document.getElementById('upload-modal').classList.remove('hidden');
    document.getElementById('config-file').value = '';
}

function closeModal() {
    document.getElementById('upload-modal').classList.add('hidden');
}

async function submitConfigUpload() {
    const userId = document.getElementById('target-user-id').value;
    const fileInput = document.getElementById('config-file');
    const file = fileInput.files[0];
    
    if (!file) {
        showToast('Please select a file', 'error');
        return;
    }
    
    try {
        // Upload to storage
        const fileExt = file.name.split('.').pop();
        const fileName = `configs/${userId}/${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('configs')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });
            
        if (uploadError) throw uploadError;
        
        // Get public URL
        const { data: { publicUrl } } = supabaseClient.storage
            .from('configs')
            .getPublicUrl(fileName);
            
        // Save to database
        const { error: dbError } = await supabaseClient
            .from('configs')
            .insert([{
                user_id: userId,
                file_url: publicUrl,
                file_name: file.name
            }]);
            
        if (dbError) throw dbError;
        
        showToast('Config uploaded successfully!', 'success');
        closeModal();
        loadAllConfigs();
        loadStats();
        
    } catch (error) {
        console.error('Upload error:', error);
        showToast(error.message || 'Upload failed', 'error');
    }
}

// ===================== STEP 7: UTILITIES =====================

function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    menu.classList.toggle('hidden');
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Close modal on outside click
window.onclick = function(event) {
    const modal = document.getElementById('upload-modal');
    if (event.target === modal) {
        closeModal();
    }
}