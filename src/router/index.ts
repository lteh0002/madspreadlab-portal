import { createRouter, createWebHistory } from 'vue-router'
import { refreshUser } from '@/api/auth'
import { getSession, isAdmin } from '@/api/session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/spreads',
    },
    {
      // Full-screen page: rendered without the sidebar (see App.vue). The only page open to
      // everyone; the rest need a login (see the guard below).
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { bare: true, public: true },
    },
    {
      path: '/spreads',
      name: 'spreads',
      component: () => import('../views/SpreadsView.vue'),
    },
    {
      path: '/spreads/index-roll/fair-value',
      name: 'fair-value',
      component: () => import('../views/FairValueView.vue'),
    },
    {
      // Price chart from the database (price_data), e.g. /spreads/products/MCA
      path: '/spreads/products/:product',
      name: 'product-chart',
      component: () => import('../views/ProductChartView.vue'),
      props: true,
    },
    {
      path: '/spreads/:spreadName/chart',
      name: 'spread-chart',
      component: () => import('../views/SpreadChartView.vue'),
      props: true,
    },
    {
      path: '/spreads/:spreadName',
      name: 'spread-detail',
      component: () => import('../views/SpreadDetailView.vue'),
      props: true,
    },
    {
      path: '/calendar',
      name: 'calendar',
      component: () => import('../views/CalendarView.vue'),
    },
    {
      path: '/research',
      name: 'research',
      component: () => import('../views/ResearchView.vue'),
    },
    {
      // One report from src/data/research/reports/, by its meta.id
      path: '/research/:id',
      name: 'research-report',
      component: () => import('../views/ResearchReportView.vue'),
      props: true,
    },
    {
      // Admins only (userType "admin"); the API also refuses admin actions to anyone else
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
      meta: { admin: true },
    },
    {
      // Every product and its spreads; set fair values. Admins only, like /admin.
      path: '/admin/products',
      name: 'manage-products',
      component: () => import('../views/ManageProductsView.vue'),
      meta: { admin: true },
    },
  ],
})

// Not signed in → the login page, coming back here afterwards. Signed in → skip the login page.
// Admin pages → Spreads for non-admins.
// This only hides pages; the API itself refuses data without a valid session, and admin actions
// to non-admins.
router.beforeEach(async (to) => {
  const signedIn = !!getSession()
  if (!to.meta.public && !signedIn) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.name === 'login' && signedIn) return '/spreads'
  if (to.meta.admin && !isAdmin.value) {
    // The stored details may be out of date (e.g. just made admin): ask the server before refusing
    await refreshUser()
    if (!getSession()) return { name: 'login', query: { redirect: to.fullPath } }
    if (!isAdmin.value) return '/spreads'
  }
})

export default router
