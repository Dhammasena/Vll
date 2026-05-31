/* ============================================================
   Night Owl VPN — Main Application Script
   ============================================================ */

// ===== CONFIGURATION — REPLACE WITH YOUR VALUES =====
const CONFIG = {
    SUPABASE_URL: 'YOUR_SUPABASE_URL',           // e.g. https://abc123.supabase.co
    SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',  // Your public anon key
    ADMIN_EMAIL: 'your-admin@email.com',           // Your admin Google email
    WHATSAPP_NUMBER: '94724212983',                // WhatsApp number (country code + number, no +)
};

// ===== Initialize Supabase Client =====
const { createClient } = supabase;
const db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// ===== DOM Elements =====
const btnLogin = document.getElementById('btnLogin');
const navUser = document.getElementById('navUser');
const navAvatar = document.getElementById('navAvatar');
const navName = document.getElementById('navName');
const dashboardSection = document.getElementById('dashboard');
const authModal = document.getElementById('authModal');
const orderForm = document.getElementById('orderForm');

// ===== State =====
let currentUser = null;

// ============================================================
// AUTHENTICATION
// ============================================================

// Google OAuth Login
async function handleLogin() {
    const { error } = await db.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + window.location.pathname,
        },
    });
    if (error) {
        showToast('Login failed: ' + error.message, 'error');
    }
}

// Logout
async function handleLogout() {
    const { error } = await db.auth.signOut();
    if (error) {
        showToast('Logout failed: ' + error.message, 'error');
        return;
    }
    currentUser = null;
    updateUIForLoggedOut();
    showToast('Logged out successfully.', 'info');
}

// Check session on page load & handle OAuth redirect
async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();

    if (session && session.user) {
        currentUser = session.user;
        await ensureUserInDB(currentUser);
        updateUIForLoggedIn(currentUser);
    } else {
        updateUIForLoggedOut();
    }

    // Listen for auth state changes (e.g., after OAuth redirect)
    db.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            await ensureUserInDB(currentUser);
            updateUIForLoggedIn(currentUser);
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            updateUIForLoggedOut();
        }
    });
}

// Ensure user record exists in the 'users' table
async function ensureUserInDB(user) {
    if (!user) return;
    try {
        // Check if user already exists
        const { data, error } = await db
            .from('users')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();

        if (error) {
            console.error('Error checking user:', error.message);
            return;
        }

        // If user doesn't exist, insert them
        if (!data) {
            const meta = user.user_metadata || {};
            const { error: insertErr } = await db.from('users').insert({
                id: user.id,
                email: user.email,
                first_name: meta.full_name ? meta.full_name.split(' ')[0] : '',
                last_name: meta.full_name ? meta.full_name.split(' ').slice(1).join(' ') : '',
            });

            if (insertErr) {
                console.error('Error inserting user:', insertErr.message);
            }
        }
    } catch (err) {
        console.error('ensureUserInDB error:', err);
    }
}

// Update UI when user is logged in
function updateUIForLoggedIn(user) {
    btnLogin.style.display = 'none';
    navUser.style.display = 'flex';

    const meta = user.user_metadata || {};
    navAvatar.src = meta.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(meta.full_name || user.email)}&background=0d0d2b&color=00e5ff&size=64`;
    navName.textContent = meta.full_name || user.email;

    // Show dashboard
    dashboardSection.style.display = 'block';

    // Pre-fill form fields if available
    if (meta.full_name) {
        const parts = meta.full_name.split(' ');
        const firstNameEl = document.getElementById('firstName');
        const lastNameEl = document.getElementById('lastName');
        if (firstNameEl && !firstNameEl.value) firstNameEl.value = parts[0] || '';
        if (lastNameEl && !lastNameEl.value) lastNameEl.value = parts.slice(1).join(' ') || '';
    }

    // Load user's orders
    loadUserOrders();

    // Re-trigger reveal for dashboard
    setTimeout(() => observeReveals(), 100);
}

// Update UI when user is logged out
function updateUIForLoggedOut() {
    btnLogin.style.display = 'inline-flex';
    navUser.style.display = 'none';
    dashboardSection.style.display = 'none';
}

// ============================================================
// ORDER FORM
// ============================================================

// Toggle Device ID field visibility based on sim package selection
function toggleDeviceId() {
    const simPackage = document.getElementById('simPackage');
    const deviceIdGroup = document.getElementById('deviceIdGroup');
    const deviceIdInput = document.getElementById('deviceId');

    if (simPackage.value === 'Mobitel sim - 222 Zoom Package') {
        deviceIdGroup.style.display = 'block';
        deviceIdInput.required = true;
    } else {
        deviceIdGroup.style.display = 'none';
        deviceIdInput.required = false;
        deviceIdInput.value = '';
    }
}

// Handle form submission
async function handleOrderSubmit(e) {
    e.preventDefault();

    if (!currentUser) {
        authModal.style.display = 'flex';
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="spinner"></span> Processing...';
    submitBtn.disabled = true;

    try {
        // Get form values
        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const vpnPackage = document.getElementById('vpnPackage').value;
        const simPackage = document.getElementById('simPackage').value;
        const deviceId = document.getElementById('deviceId').value.trim();
        const fileInput = document.getElementById('paymentSlip');
        const file = fileInput.files[0];

        // Validate file
        if (!file) {
            showToast('Please upload your payment slip.', 'error');
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast('File size must be under 5MB.', 'error');
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            return;
        }

        // Upload payment slip to Supabase Storage
        showToast('Uploading payment slip...', 'info');
        const fileExt = file.name.split('.').pop();
        const fileName = `slips/${currentUser.id}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await db.storage
            .from('slips')
            .upload(fileName, file);

        if (uploadError) {
            throw new Error('Slip upload failed: ' + uploadError.message);
        }

        // Get public URL of the uploaded slip
        const { data: urlData } = db.storage.from('slips').getPublicUrl(fileName);
        const slipUrl = urlData.publicUrl;

        // Insert order into the database
        const { error: orderError } = await db.from('orders').insert({
            user_id: currentUser.id,
            email: currentUser.email,
            first_name: firstName,
            last_name: lastName,
            vpn_package: vpnPackage,
            sim_package: simPackage,
            device_id: deviceId || null,
            slip_url: slipUrl,
            status: 'pending',
        });

        if (orderError) {
            throw new Error('Order creation failed: ' + orderError.message);
        }

        showToast('Order placed successfully!', 'success');

        // Format WhatsApp message
        const message = buildWhatsAppMessage({
            firstName,
            lastName,
            vpnPackage,
            simPackage,
            deviceId,
            slipUrl,
        });

        // Redirect to WhatsApp
        const waUrl = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');

        // Reset form
        orderForm.reset();
        document.getElementById('deviceIdGroup').style.display = 'none';
        document.getElementById('fileDropZone').classList.remove('has-file');
        document.getElementById('fileLabel').textContent = 'Click to upload or drag & drop';

        // Reload orders
        loadUserOrders();

    } catch (err) {
        console.error('Order submission error:', err);
        showToast(err.message || 'An error occurred. Please try again.', 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Build the WhatsApp message
function buildWhatsAppMessage({ firstName, lastName, vpnPackage, simPackage, deviceId, slipUrl }) {
    let msg = `🦉 *Night Owl VPN — New Order*\n\n`;
    msg += `👤 *Name:* ${firstName} ${lastName}\n`;
    msg += `📦 *VPN Package:* ${vpnPackage}\n`;
    msg += `📱 *Sim & Base Package:* ${simPackage}\n`;
    if (deviceId) {
        msg += `🔧 *Device ID:* ${deviceId}\n`;
    }
    msg += `🧾 *Payment Slip:* ${slipUrl}\n\n`;
    msg += `Thank you! 🙏`;
    return msg;
}

// ============================================================
// USER ORDERS
// ============================================================

async function loadUserOrders() {
    if (!currentUser) return;

    const container = document.getElementById('orderHistory');

    try {
        const { data: orders, error } = await db
            .from('orders')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) {
            container.innerHTML = `<p class="empty-state" style="color:var(--danger);">Error loading orders.</p>`;
            return;
        }

        if (!orders || orders.length === 0) {
            container.innerHTML = `<p class="empty-state">No orders yet. Place your first order!</p>`;
            return;
        }

        container.innerHTML = orders.map(o => `
            <div class="order-item">
                <div class="order-item-header">
                    <span class="order-item-package">${o.vpn_package}</span>
                    <span class="badge badge-${o.status === 'active' ? 'success' : o.status === 'rejected' ? 'danger' : 'warning'}">${o.status}</span>
                </div>
                <div class="order-item-sim">${o.sim_package}</div>
                <div class="order-item-date">${new Date(o.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                <div class="order-item-actions">
                    ${o.config_url ? `<a href="${o.config_url}" target="_blank" class="btn btn-primary btn-xs"><i class="fas fa-download"></i> Download Config</a>` : '<span style="font-size:0.8rem;color:var(--text-muted);">Config: Pending</span>'}
                </div>
            </div>
        `).join('');

    } catch (err) {
        container.innerHTML = `<p class="empty-state" style="color:var(--danger);">Error loading orders.</p>`;
    }
}

// ============================================================
// FILE UPLOAD HANDLING
// ============================================================

function setupFileUpload() {
    const dropZone = document.getElementById('fileDropZone');
    const fileInput = document.getElementById('paymentSlip');
    const fileLabel = document.getElementById('fileLabel');

    if (!dropZone || !fileInput) return;

    // Click to select file
    dropZone.addEventListener('click', () => fileInput.click());

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--neon-cyan)';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = '';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '';
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            updateFileLabel(e.dataTransfer.files[0]);
        }
    });

    // File input change
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            updateFileLabel(fileInput.files[0]);
        }
    });

    function updateFileLabel(file) {
        fileLabel.textContent = file.name;
        dropZone.classList.add('has-file');
    }
}

// ============================================================
// NAVIGATION & UI
// ============================================================

// Scroll to dashboard (or prompt login)
function scrollToDashboard() {
    if (!currentUser) {
        authModal.style.display = 'flex';
        return;
    }
    dashboardSection.scrollIntoView({ behavior: 'smooth' });
}

// Close modal
function closeModal() {
    authModal.style.display = 'none';
}

// Mobile nav toggle
function toggleMobileNav() {
    const navLinks = document.getElementById('navLinks');
    const hamburger = document.getElementById('hamburger');
    navLinks.classList.toggle('open');
    hamburger.classList.toggle('active');
}

// Close mobile nav when a link is clicked
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
        document.getElementById('navLinks').classList.remove('open');
        document.getElementById('hamburger').classList.remove('active');
    });
});

// Navbar scroll effect
window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Copy text to clipboard
function copyText(text, element) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
        const icon = element.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-check';
            setTimeout(() => { icon.className = 'fas fa-copy'; }, 2000);
        }
    }).catch(() => {
        showToast('Failed to copy.', 'error');
    });
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle' };
    toast.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i> ${message}`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ============================================================
// SCROLL REVEAL ANIMATIONS
// ============================================================

function observeReveals() {
    const reveals = document.querySelectorAll('.reveal:not(.visible)');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, idx) => {
            if (entry.isIntersecting) {
                // Stagger animation
                setTimeout(() => {
                    entry.target.classList.add('visible');
                }, idx * 80);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    reveals.forEach(el => observer.observe(el));
}

// ============================================================
// PARTICLES.JS INITIALIZATION
// ============================================================

function initParticles() {
    if (typeof particlesJS === 'undefined') return;

    particlesJS('particles-js', {
        particles: {
            number: {
                value: window.innerWidth < 768 ? 30 : 60,
                density: { enable: true, value_area: 900 }
            },
            color: { value: ['#00e5ff', '#ff9f1c', '#ffc857'] },
            shape: { type: 'circle' },
            opacity: {
                value: 0.35,
                random: true,
                anim: { enable: true, speed: 0.5, opacity_min: 0.1, sync: false }
            },
            size: {
                value: 2.5,
                random: true,
                anim: { enable: true, speed: 1, size_min: 0.5, sync: false }
            },
            line_linked: {
                enable: true,
                distance: 160,
                color: '#00e5ff',
                opacity: 0.08,
                width: 1
            },
            move: {
                enable: true,
                speed: 0.6,
                direction: 'none',
                random: true,
                straight: false,
                out_mode: 'out',
                bounce: false,
            }
        },
        interactivity: {
            detect_on: 'canvas',
            events: {
                onhover: { enable: true, mode: 'grab' },
                onclick: { enable: false },
                resize: true
            },
            modes: {
                grab: { distance: 180, line_linked: { opacity: 0.2 } },
            }
        },
        retina_detect: true
    });
}

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize particles
    initParticles();

    // Setup file upload interactions
    setupFileUpload();

    // Check authentication state
    await checkAuth();

    // Start scroll reveal observer
    observeReveals();
});