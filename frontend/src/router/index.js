import { createRouter, createWebHistory } from 'vue-router';
import { h } from 'vue';

// 1. Root & Auth Views
import HomeView from '../views/HomeView.vue';
import Login from '../views/student/Login.vue';
import Register from '../views/student/Register.vue';
import AuthSuccess from '../views/student/AuthSuccess.vue';
import OwnerDetailsRegister from '../views/student/OwnerDetailsRegister.vue';

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
        component: HomeView,
        meta: { title: 'Home' }
    },
    {
        path: '/login',
        alias: ['/login-options', '/users/login', '/users/login-options'],
        name: 'Login',
        component: Login,
        meta: { title: 'Sign In' }
    },
    {
        path: '/register',
        alias: '/users/register',
        name: 'Register',
        component: Register,
        meta: { title: 'Student Registration' }
    },
    {
        path: '/register/owner-details',
        name: 'OwnerDetailsRegister',
        component: OwnerDetailsRegister,
        meta: { title: 'Landlord Onboarding' }
    },
    {
        path: '/auth-success',
        name: 'AuthSuccess',
        component: AuthSuccess,
        meta: { title: 'Authenticating' }
    },

    // Student Protected Routes 
    {
        path: '/student/dashboard',
        alias: '/users/student/dashboard',
        name: 'StudentDashboard',
        component: StudentDashboard,
        meta: { title: 'Student Portal' }
    },
    {
        path: '/student/profile',
        alias: '/users/student/profile',
        name: 'StudentProfile',
        component: StudentProfile,
        meta: { title: 'Student Profile' }
    },
    {
        path: '/student/house/:id',
        alias: '/users/student/house/:id',
        name: 'StudentHouseDetails',
        component: StudentHouseDetails,
        meta: { title: 'Property Details' }
    },
    {
        path: '/student/notifications',
        name: 'StudentNotifications',
        component: Notifications,
        meta: { title: 'Student Notifications' }
    },
    {
        path: '/student/bookings',
        alias: '/users/student/bookings',
        name: 'StudentBookings',
        component: StudentBookings,
        meta: { title: 'My Reservations' }
    },
    {
        path: '/student/book/:id',
        alias: '/users/student/book/:id',
        name: 'StudentBook',
        component: StudentBook,
        meta: { title: 'Reserve Room' }
    },

    // Owner Protected Routes 
    {
        path: '/owner/dashboard',
        alias: '/users/owner/dashboard',
        name: 'OwnerDashboard',
        component: OwnerDashboard,
        meta: { title: 'Landlord Dashboard' }
    },
    {
        path: '/owner/accreditation',
        alias: '/users/owner/accreditation',
        name: 'OwnerAccreditation',
        component: OwnerAccreditation,
        meta: { title: 'Property Accreditation Application' }
    },
    {
        path: '/owner/pending-review',
        alias: '/users/owner/pending-review',
        name: 'OwnerPendingReview',
        component: OwnerPendingReview,
        meta: { title: 'Accreditation Review Status' }
    },
    {
        path: '/owner/documents/:id?',
        alias: [
            '/users/owner/documents/:id?',
            '/owner/documents',
            '/users/owner/documents'
        ],
        name: 'OwnerDocuments',
        component: OwnerDocuments,
        meta: { title: 'Legal Documents Management' }
    },
    {
        path: '/owner/bookings',
        alias: '/users/owner/bookings',
        name: 'OwnerBookings',
        component: OwnerBookings,
        meta: { title: 'Reservation Requests' }
    },
    {
        path: '/owner/edit/:id',
        alias: '/users/owner/edit/:id',
        name: 'OwnerEdit',
        component: OwnerEdit,
        meta: { title: 'Edit Boarding House' }
    },
    {
        path: '/owner/rooms/:id',
        alias: '/users/owner/rooms/:id',
        name: 'OwnerRooms',
        component: OwnerRooms,
        meta: { title: 'Manage Rooms & Pricing' }
    },
    {
        path: '/owner/rooms/details/:id',
        alias: [
            '/users/owner/rooms/details/:id',
            '/owner/view/:id',
            '/users/owner/view/:id'
        ],
        name: 'OwnerViewDetails',
        component: OwnerViewDetails,
        meta: { title: 'Room Details' }
    },
    {
        path: '/owner/notifications',
        alias: '/users/owner/notifications',
        name: 'OwnerNotifications',
        component: Notifications,
        meta: { title: 'Landlord Notifications' }
    },
    {
        path: '/owner/profile',
        alias: '/users/owner/profile',
        name: 'OwnerProfile',
        component: OwnerProfile,
        meta: { title: 'Landlord Profile' }
    },

    // Admin Protected Routes
    {
        path: '/admin/dashboard',
        name: 'AdminDashboard',
        component: AdminDashboard,
        meta: { title: 'Admin Dashboard' }
    },
    {
        path: '/admin/pending-applications',
        name: 'AdminPendingApplications',
        component: AdminPendingApplications,
        meta: { title: 'Accreditation Applications' }
    },
    {
        path: '/admin/new-application',
        redirect: '/admin/pending-applications'
    },
    {
        path: '/admin/emergency-monitoring',
        name: 'AdminEmergencyMonitoring',
        component: AdminEmergencyMonitoring,
        meta: { title: 'Emergency Monitoring Registry' }
    },
    {
        path: '/admin/notifications',
        name: 'AdminNotifications',
        component: Notifications,
        meta: { title: 'Admin Notifications' }
    },
    {
        path: '/admin/registered',
        name: 'AdminRegistered',
        component: AdminRegistered,
        meta: { title: 'Accredited Boarding Houses' }
    },
    {
        path: '/admin/archived',
        name: 'AdminArchived',
        component: AdminArchived,
        meta: { title: 'Archived Properties' }
    },
    {
        path: '/admin/users',
        name: 'AdminUsers',
        component: AdminUsers,
        meta: { title: 'User Account Management' }
    },

    // Dynamic Printable Reports Routes
    {
        path: '/admin/reports/masterlist',
        name: 'ReportMasterlist',
        component: ReportMasterlist,
        meta: { title: 'Masterlist Audit Report' }
    },
    {
        path: '/admin/reports/compliance',
        name: 'ReportCompliance',
        component: ReportCompliance,
        meta: { title: 'Accreditation Compliance Audit' }
    },
    {
        path: '/admin/reports/emergency-registry',
        name: 'ReportEmergency',
        component: ReportEmergency,
        meta: { title: 'Emergency Residency Audit' }
    },
    {
        path: '/admin/reports/transactions',
        name: 'ReportTransactions',
        component: ReportTransactions,
        meta: { title: 'Reservation Transactions Audit' }
    }
];

const router = createRouter({
    history: createWebHistory(),
    routes
});

// ─── Global Title Guard ───────────────────────────────────────────
router.afterEach((to) => {
    const baseTitle = "CSPC's Boarding House System";
    document.title = to.meta && to.meta.title ? `${to.meta.title} | ${baseTitle}` : baseTitle;
});

// ─── Global Navigation Guard ───────────────────────────────────────
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

    // ─── OWNER ONBOARDING: always allow (no token yet at this point) ───
    if (to.name === 'OwnerDetailsRegister') {
        return next();
    }
    // ─── ADMIN ROUTES: block completely if not logged in as admin ───
    if (to.path.startsWith('/admin/')) {
        if (!isLoggedIn || user.role !== 'admin') {
            return next('/login-options');
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
            return next('/login-options');
        }
        return next();
    }

    // ─── OWNER ROUTES ───────────────────────────────────────────────────
    if (to.path.startsWith('/owner/') || to.path.startsWith('/users/owner/')) {
        if (!isLoggedIn || user.role !== 'owner') {
            return next('/login-options');
        }

        const houseStatus = user.houseStatus || user.house_status || 'none';

        if (to.name === 'OwnerAccreditation') {
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