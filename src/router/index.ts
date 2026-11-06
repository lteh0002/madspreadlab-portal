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
      // static /spreads/index-roll/fair-value above takes precedence over this
      path: '/spreads/index-roll/:market',
      name: 'index-roll',
      component: () => import('../views/IndexRollView.vue'),
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
      path: '/about',
      name: 'about',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/AboutView.vue'),
    },
  ],
})

export default router
