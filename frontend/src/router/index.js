import { createRouter, createWebHistory } from 'vue-router';
import { h } from 'vue'; // Statically imports render function utility for Placeholders

// 1. Root & Auth Views
import HomeView from '../views/HomeView.vue';
import LoginOptions from '../views/student/LoginOptions.vue';
import Login from '../views/student/Login.vue';
import Register from '../views/student/Register.vue';
import AuthSuccess from '../views/student/AuthSuccess.vue';

// 2. Student Dashboard Views
import StudentDashboard from '../views/student/StudentDashboard.vue';
import StudentProfile from '../views/student/StudentProfile.vue';
import StudentHouseDetails from '../views/student/HouseDetails.vue';
import StudentBook from '../views/student/Book.vue';
import StudentBookings from '../views/student/StudentBookings.vue';

// 3. Owner Dashboard Views
import OwnerDashboard from '../views/owner/OwnerDashboard.vue';
import OwnerAccreditation from '../views/owner/OwnerAccreditation.vue';
import OwnerPendingReview from '../views/owner/PendingReview.vue';
import OwnerDocuments from '../views/owner/Documents.vue';
import OwnerBookings from '../views/owner/Bookings.vue';
import OwnerEdit from '../views/owner/EditHouse.vue';
import OwnerRooms from '../views/owner/Rooms.vue';
import OwnerProfile from '../views/owner/Profile.vue';
import OwnerViewDetails from '../views/owner/RoomDetails.vue';

// 4. Admin Dashboard Views
import AdminDashboard from '../views/admin/AdminDashboard.vue';
import AdminPendingApplications from '../views/admin/PendingApplications.vue';
import AdminEmergencyMonitoring from '../views/admin/EmergencyMonitoring.vue';
import ReportMasterlist from '../views/admin/ReportMasterlist.vue';
import ReportCompliance from '../views/admin/ReportCompliance.vue';
import ReportEmergency from '../views/admin/ReportEmergency.vue';
import ReportTransactions from '../views/admin/ReportTransactions.vue';
import AdminRegistered from '../views/admin/Registered.vue';
import AdminArchived from '../views/admin/Archived.vue';
import AdminUsers from '../views/admin/Users.vue';

// 5. Shared Views
import Notifications from '../views/Notifications.vue';

// Fallback Placeholder for unbuilt Admin screens (Uses render functions to avoid runtime compilation crashes)
const Placeholder = {
    render() {
        return h('div', {
            class: 'p-20 text-center font-bold text-slate-500 uppercase tracking-widest text-xs bg-white rounded-3xl border border-slate-100 max-w-xl mx-auto my-10 shadow-sm'
        }, 'This module is currently being finalized.');
    }
};

const routes = [
    {
        path: '/',
        name: 'Home',
        component: HomeView
    },
    {
        path: '/login-options',
        alias: '/users/login-options',
        name: 'LoginOptions',
        component: LoginOptions
    },
    {
        path: '/login',
        alias: '/users/login',
        name: 'Login',
        component: Login
    },
    {
        path: '/register',
        alias: '/users/register',
        name: 'Register',
        component: Register
    },
    {
        path: '/auth-success',
        name: 'AuthSuccess',
        component: AuthSuccess
    },

    // Student Protected Routes 
    {
        path: '/student/dashboard',
        alias: '/users/student/dashboard',
        name: 'StudentDashboard',
        component: StudentDashboard
    },
    {
        path: '/student/profile',
        alias: '/users/student/profile',
        name: 'StudentProfile',
        component: StudentProfile
    },
    {
        path: '/student/house/:id',
        alias: '/users/student/house/:id',
        name: 'StudentHouseDetails',
        component: StudentHouseDetails
    },
    {
        path: '/student/notifications',
        name: 'StudentNotifications',
        component: Notifications
    },
    {
        path: '/student/bookings',
        alias: '/users/student/bookings',
        name: 'StudentBookings',
        component: StudentBookings
    },
    {
        path: '/student/book/:id',
        alias: '/users/student/book/:id',
        name: 'StudentBook',
        component: StudentBook
    },

    // Owner Protected Routes 
    {
        path: '/owner/dashboard',
        alias: '/users/owner/dashboard',
        name: 'OwnerDashboard',
        component: OwnerDashboard
    },
    {
        path: '/owner/accreditation',
        alias: '/users/owner/accreditation',
        name: 'OwnerAccreditation',
        component: OwnerAccreditation
    },
    {
        path: '/owner/pending-review',
        alias: '/users/owner/pending-review',
        name: 'OwnerPendingReview',
        component: OwnerPendingReview
    },
    {
        path: '/owner/documents/:id?',
        alias: [
            '/users/owner/documents/:id?',
            '/owner/documents',
            '/users/owner/documents'
        ],
        name: 'OwnerDocuments',
        component: OwnerDocuments
    },
    {
        path: '/owner/bookings',
        alias: '/users/owner/bookings',
        name: 'OwnerBookings',
        component: OwnerBookings
    },
    {
        path: '/owner/edit/:id',
        alias: '/users/owner/edit/:id',
        name: 'OwnerEdit',
        component: OwnerEdit
    },
    {
        path: '/owner/rooms/:id',
        alias: '/users/owner/rooms/:id',
        name: 'OwnerRooms',
        component: OwnerRooms
    },
    {
        path: '/owner/rooms/details/:id',
        alias: [
            '/users/owner/rooms/details/:id',
            '/owner/view/:id',
            '/users/owner/view/:id'
        ],
        name: 'OwnerViewDetails',
        component: OwnerViewDetails
    },
    {
        path: '/owner/notifications',
        alias: '/users/owner/notifications',
        name: 'OwnerNotifications',
        component: Notifications
    },
    {
        path: '/owner/profile',
        alias: '/users/owner/profile',
        name: 'OwnerProfile',
        component: OwnerProfile
    },

    // Admin Protected Routes
    {
        path: '/admin/dashboard',
        name: 'AdminDashboard',
        component: AdminDashboard
    },
    {
        path: '/admin/pending-applications',
        name: 'AdminPendingApplications',
        component: AdminPendingApplications
    },
    {
        path: '/admin/new-application',
        redirect: '/admin/pending-applications'
    },
    {
        path: '/admin/emergency-monitoring',
        name: 'AdminEmergencyMonitoring',
        component: AdminEmergencyMonitoring
    },
    {
        path: '/admin/notifications',
        name: 'AdminNotifications',
        component: Notifications
    },
    {
        path: '/admin/registered',
        name: 'AdminRegistered',
        component: AdminRegistered
    },
    {
        path: '/admin/archived',
        name: 'AdminArchived',
        component: AdminArchived
    },
    {
        path: '/admin/users',
        name: 'AdminUsers',
        component: AdminUsers
    },

    // Dynamic Printable Reports Routes
    {
        path: '/admin/reports/masterlist',
        name: 'ReportMasterlist',
        component: ReportMasterlist
    },
    {
        path: '/admin/reports/compliance',
        name: 'ReportCompliance',
        component: ReportCompliance
    },
    {
        path: '/admin/reports/emergency-registry',
        name: 'ReportEmergency',
        component: ReportEmergency
    },
    {
        path: '/admin/reports/transactions',
        name: 'ReportTransactions',
        component: ReportTransactions
    }
];

const router = createRouter({
    history: createWebHistory(),
    routes
});

// ─── Global Navigation Guard 
// ─── Global Navigation Guard 
router.beforeEach((to, from, next) => {
    let user = null;

    try {
        const rawUser = localStorage.getItem('cspc_user');
        if (rawUser && rawUser !== 'undefined') {
            user = JSON.parse(rawUser);
        }
    } catch (e) {
        console.error("[ROUTER GUARD] Corrupted local storage user data detected:", e);
        localStorage.removeItem('cspc_user');
    }

    const token = localStorage.getItem('cspc_token');
    const isLoggedIn = !!(token && user);

    // ─── ADMIN ROUTES: block completely if not logged in as admin ───
    if (to.path.startsWith('/admin/')) {
        if (!isLoggedIn || user.role !== 'admin') {
            return next('/login');
        }
        return next();
    }

    // ─── STUDENT ROUTES: block completely if not logged in as student ───
    if (to.path.startsWith('/student/') || to.path.startsWith('/users/student/')) {
    
        const isGuestAllowed = to.name === 'StudentDashboard' || to.name === 'StudentHouseDetails';

        if (isGuestAllowed) {
            return next();
        }

        if (!isLoggedIn || user.role !== 'student') {
            return next('/login');
        }
        return next();
    }

    // ─── OWNER ROUTES (your existing logic, now gated behind a login check first) ───
    if (to.path.startsWith('/owner/') || to.path.startsWith('/users/owner/')) {
        if (!isLoggedIn || user.role !== 'owner') {
            return next('/login');
        }

        // Resolves any casing mismatches from backend database columns
        const houseStatus = user.houseStatus || user.house_status || 'none';

        if (to.name === 'OwnerAccreditation') {
            // ─── SECURE ONBOARDING BYPASS ───
            if (to.query.new === 'true' || to.query.houseId) {
                return next();
            }

            if (houseStatus === 'pending' || houseStatus === 'rejected') {
                return next('/owner/pending-review');
            }
            if (houseStatus === 'accredited') {
                return next('/owner/dashboard');
            }
            return next();
        }

        if (to.name === 'OwnerPendingReview') {
            if (houseStatus === 'accredited') {
                return next('/owner/dashboard');
            }
            if (houseStatus === 'none') {
                return next('/owner/accreditation');
            }
            return next();
        }

        const allowedExemptions = [
            'OwnerDocuments',
            'OwnerProfile',
            'OwnerNotifications'
        ];

        if (allowedExemptions.includes(to.name)) {
            return next();
        }

        // Fallback Block
        if (houseStatus !== 'accredited') {
            if (houseStatus === 'pending' || houseStatus === 'rejected') {
                return next('/owner/pending-review');
            }
            return next('/owner/accreditation');
        }
    }

    next();
});

export default router;