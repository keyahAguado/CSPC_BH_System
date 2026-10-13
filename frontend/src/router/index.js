import { createRouter, createWebHistory } from 'vue-router';
import { h } from 'vue';

// 1. Root & Auth Views
import HomeView from '../views/HomeView.vue';
import AccountDeactivated from '../views/AccountDeactivated.vue';
import Login from '../views/student/Login.vue';
import AuthSuccess from '../views/student/AuthSuccess.vue';
import OwnerDetailsRegister from '../views/student/OwnerDetailsRegister.vue';

// 2. Student Dashboard Views
import StudentDashboard from '../views/student/StudentDashboard.vue';
import StudentProfile from '../views/student/StudentProfile.vue';
import StudentHouseDetails from '../views/student/HouseDetails.vue';
import StudentBook from '../views/student/Book.vue';
import StudentBookings from '../views/student/StudentBookings.vue';
import StudentBookingDetails from '../views/student/BookingDetails.vue';
import StudentNotifications from '../views/student/StudentNotifications.vue';

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
import VerifyApplicantEmail from '../views/owner/VerifyApplicantEmail.vue';
import TrackApplication from '../views/owner/TrackApplication.vue';
import ActivateAccount from '../views/owner/ActivateAccount.vue';

// 4. Admin Dashboard Views
import AdminDashboard from '../views/admin/AdminDashboard.vue';
import AdminPendingApplications from '../views/admin/PendingApplications.vue';
import AdminEmergencyMonitoring from '../views/admin/EmergencyMonitoring.vue';
import ReportMasterlist from '../views/admin/ReportMasterlist.vue';
import ReportCompliance from '../views/admin/ReportCompliance.vue';
import AdminRegistered from '../views/admin/Registered.vue';
import AdminArchived from '../views/admin/Archived.vue';
import AdminUsers from '../views/admin/Users.vue';
import AdminSiteContent from '../views/admin/SiteContent.vue';

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
        path: '/account-deactivated',
        name: 'AccountDeactivated',
        component: AccountDeactivated,
        meta: { public: true, title: 'Account Deactivated' }
    },
    {
        path: '/',
        name: 'Home',
        component: HomeView,
        meta: { public: true, title: 'Home' }
    },
    {
        path: '/login',
        alias: ['/login-options', '/users/login', '/users/login-options'],
        name: 'Login',
        component: Login,
        meta: { public: true, title: 'Sign In' }
    },
    {
        path: '/register',
        alias: '/users/register',
        name: 'Register',
        // Property-first owner registration: the owner registers the property,
        // SASO approves it, then SASO issues the reference number, email and password.
        component: OwnerAccreditation,
        meta: { public: true, publicRegistration: true, title: 'Register Your Property' }
    },
    {
        // Public applicant email verification; separate from owner login
        path: '/verify-applicant-email',
        name: 'VerifyApplicantEmail',
        component: VerifyApplicantEmail,
        meta: { public: true, title: 'Verify Applicant Email' }
    },
    {
        path: '/track',
        alias: '/track-application',
        name: 'TrackApplication',
        component: TrackApplication,
        meta: { public: true, title: 'Track My Application' }
    },
    {
        path: '/activate-account',
        name: 'ActivateAccount',
        component: ActivateAccount,
        meta: { public: true, title: 'Activate Owner Account' }
    },
    {
        path: '/register/owner-details',
        name: 'OwnerDetailsRegister',
        component: OwnerDetailsRegister,
        meta: { public: true, title: 'Landlord Onboarding' }
    },
    {
        path: '/auth-success',
        name: 'AuthSuccess',
        component: AuthSuccess,
        meta: { public: true, title: 'Authenticating' }
    },

    // Student Protected Routes 
    {
        path: '/student/dashboard',
        alias: '/users/student/dashboard',
        name: 'StudentDashboard',
        component: StudentDashboard,
        meta: { role: 'student', title: 'Student Portal' }
    },
    {
        path: '/student/profile',
        alias: '/users/student/profile',
        name: 'StudentProfile',
        component: StudentProfile,
        meta: { role: 'student', title: 'Student Profile' }
    },
    {
        path: '/student/house/:id',
        alias: '/users/student/house/:id',
        name: 'StudentHouseDetails',
        component: StudentHouseDetails,
        meta: { role: 'student', title: 'Property Details' }
    },
    {
        path: '/student/notifications',
        name: 'StudentNotifications',
        component: StudentNotifications,
        meta: { role: 'student', title: 'Student Notifications' }
    },
    {
        path: '/student/bookings',
        alias: '/users/student/bookings',
        name: 'StudentBookings',
        component: StudentBookings,
        meta: { role: 'student', title: 'My Bookings' }
    },
    {
        path: '/student/bookings/:id',
        name: 'StudentBookingDetails',
        component: StudentBookingDetails,
        meta: { role: 'student', title: 'Booking Details' }
    },
    {
        path: '/student/book/:id',
        alias: '/users/student/book/:id',
        name: 'StudentBook',
        component: StudentBook,
        meta: { role: 'student', title: 'Reserve Room' }
    },

    // Owner Protected Routes 
    {
        path: '/owner/dashboard',
        alias: '/users/owner/dashboard',
        name: 'OwnerDashboard',
        component: OwnerDashboard,
        meta: { role: 'owner', title: 'Landlord Dashboard' }
    },
    {
        path: '/owner/accreditation',
        alias: '/users/owner/accreditation',
        name: 'OwnerAccreditation',
        component: OwnerAccreditation,
        meta: { role: 'owner', title: 'Property Accreditation Application' }
    },
    {
        path: '/owner/pending-review',
        alias: '/users/owner/pending-review',
        name: 'OwnerPendingReview',
        component: OwnerPendingReview,
        meta: { role: 'owner', title: 'Accreditation Review Status' }
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
        meta: { role: 'owner', title: 'Legal Documents Management' }
    },
    {
        path: '/owner/bookings',
        alias: '/users/owner/bookings',
        name: 'OwnerBookings',
        component: OwnerBookings,
        meta: { role: 'owner', title: 'Reservation Requests' }
    },
    {
        path: '/owner/edit/:id',
        alias: '/users/owner/edit/:id',
        name: 'OwnerEdit',
        component: OwnerEdit,
        meta: { role: 'owner', title: 'Edit Boarding House' }
    },
    {
        path: '/owner/rooms/:id',
        alias: '/users/owner/rooms/:id',
        name: 'OwnerRooms',
        component: OwnerRooms,
        meta: { role: 'owner', title: 'Manage Rooms & Pricing' }
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
        meta: { role: 'owner', title: 'Room Details' }
    },
    {
        path: '/owner/notifications',
        alias: '/users/owner/notifications',
        name: 'OwnerNotifications',
        component: Notifications,
        meta: { role: 'owner', title: 'Landlord Notifications' }
    },
    {
        path: '/owner/profile',
        alias: '/users/owner/profile',
        name: 'OwnerProfile',
        component: OwnerProfile,
        meta: { role: 'owner', title: 'Landlord Profile' }
    },

    // Admin Protected Routes
    {
        path: '/admin/dashboard',
        name: 'AdminDashboard',
        component: AdminDashboard,
        meta: { role: 'admin', title: 'Admin Home' }
    },
    {
        path: '/admin/pending-applications',
        name: 'AdminPendingApplications',
        component: AdminPendingApplications,
        meta: { role: 'admin', title: 'Accreditation Applications' }
    },
    {
        path: '/admin/new-application',
        redirect: '/admin/pending-applications'
    },
    {
        path: '/admin/emergency-monitoring',
        name: 'AdminEmergencyMonitoring',
        component: AdminEmergencyMonitoring,
        meta: { role: 'admin', title: 'Emergency Registry Residence Report' }
    },
    {
        path: '/admin/notifications',
        name: 'AdminNotifications',
        component: Notifications,
        meta: { role: 'admin', title: 'Admin Notifications' }
    },
    {
        path: '/admin/registered',
        name: 'AdminRegistered',
        component: AdminRegistered,
        meta: { role: 'admin', title: 'Accredited Boarding Houses' }
    },
    {
        path: '/admin/archived',
        name: 'AdminArchived',
        component: AdminArchived,
        meta: { role: 'admin', title: 'Archived Properties' }
    },
    {
        path: '/admin/users',
        name: 'AdminUsers',
        component: AdminUsers,
        meta: { role: 'admin', title: 'User Account Management' }
    },
    {
        path: '/admin/site-content',
        name: 'AdminSiteContent',
        component: AdminSiteContent,
        meta: { role: 'admin', title: 'Landing Page Content' }
    },

    // Dynamic Printable Reports Routes
    {
        path: '/admin/reports/masterlist',
        name: 'ReportMasterlist',
        component: ReportMasterlist,
        meta: { role: 'admin', title: 'Masterlist Audit Report' }
    },
    {
        path: '/admin/reports/compliance',
        name: 'ReportCompliance',
        component: ReportCompliance,
        meta: { role: 'admin', title: 'Accreditation Compliance Audit' }
    },
    // Reservation history report was removed; old links go to the admin home
    {
        path: '/admin/reports/transactions',
        redirect: '/admin/dashboard'
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

// ─── Global Navigation Guard (ST-02 Compliance) ─────────────────────
router.beforeEach((to, from, next) => {
    let user = null;

    try {
        const rawUser = sessionStorage.getItem('cspc_user');
        if (rawUser && rawUser !== 'undefined') {
            user = JSON.parse(rawUser);
        }
    } catch (e) {
        console.error("[ROUTER GUARD] Corrupted local storage user data detected:", e);
        sessionStorage.removeItem('cspc_user');
    }

    const token = sessionStorage.getItem('cspc_token');
    const isPublic = !!(to.meta && to.meta.public);
    const isGuestStudentView = (to.name === 'StudentDashboard' || to.name === 'StudentHouseDetails');

    // ─── 0. REDIRECT ALREADY AUTHENTICATED USERS FROM AUTH/GUEST PAGES ─
    const authGuestPages = ['/login', '/login-options', '/register', '/register/owner-details'];
    if (token && user && authGuestPages.includes(to.path)) {
        if (user.role === 'admin') {
            return next('/admin/dashboard');
        } else if (user.role === 'owner') {
            const houseStatus = user.houseStatus || user.house_status || 'none';
            if (houseStatus === 'accredited') return next('/owner/dashboard');
            else if (houseStatus === 'pending' || houseStatus === 'rejected') return next('/owner/pending-review');
            else return next('/owner/accreditation');
        } else if (user.role === 'student') {
            return next('/student/dashboard');
        }
    }

    // ─── 1. PUBLIC ROUTES ─────────────────────────────────────────────
    if (isPublic) {
        return next();
    }

    // ─── 2. GUEST ACCESS FOR STUDENT DASHBOARD / DETAILS ──────────────
    if (isGuestStudentView && !token) {
        return next();
    }

    // ─── 3. MISSING AUTH TOKEN GUARD ──────────────────────────────────
    if (!token || !user) {
        return next('/login?error=session_required');
    }

    // ─── 4. ROLE COMPLIANCE GUARD ─────────────────────────────────────
    const requiredRole = to.meta && to.meta.role;

    if (requiredRole && user.role !== requiredRole) {
        return next('/login?error=unauthorized');
    }

    if (to.path.startsWith('/admin/') && user.role !== 'admin') {
        return next('/login?error=unauthorized');
    }

    if ((to.path.startsWith('/owner/') || to.path.startsWith('/users/owner/')) && user.role !== 'owner') {
        return next('/login?error=unauthorized');
    }

    if ((to.path.startsWith('/student/') || to.path.startsWith('/users/student/')) && user.role !== 'student' && !isGuestStudentView) {
        return next('/login?error=unauthorized');
    }

    // ─── 5. OWNER ACCREDITATION LIFECYCLE GUARDS ──────────────────────
    if (to.path.startsWith('/owner/') || to.path.startsWith('/users/owner/')) {
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

// Clean up orphaned Google Places Autocomplete (.pac-container) elements on route transition
router.afterEach(() => {
    document.querySelectorAll('.pac-container').forEach(el => el.remove());
});

export default router;