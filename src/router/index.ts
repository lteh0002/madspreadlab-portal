import { createRouter, createWebHistory } from 'vue-router'
import { getSession } from '@/api/session'

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
      // NOTE: not protected yet. Admin actions must be checked server-side once they exist.
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
    },
    {
      // Every product and its spreads; set fair values. Not protected yet, like /admin.
      path: '/admin/products',
      name: 'manage-products',
      component: () => import('../views/ManageProductsView.vue'),
    },
  ],
})

// Not signed in → the login page, coming back here afterwards. Signed in → skip the login page.
// This only hides pages; the API itself refuses data to anyone without a valid session.
router.beforeEach((to) => {
  const signedIn = !!getSession()
  if (!to.meta.public && !signedIn) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.name === 'login' && signedIn) return '/spreads'
})

export default router
