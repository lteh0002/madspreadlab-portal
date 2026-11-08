import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
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

export default router
