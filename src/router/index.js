import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'overview',
    component: () => import('../views/OverviewView.vue'),
  },
  {
    path: '/site/new',
    name: 'add-site',
    component: () => import('../views/AddSiteView.vue'),
  },
  {
    path: '/site/:id',
    name: 'site-dashboard',
    component: () => import('../views/SiteDashboardView.vue'),
  },
  {
    path: '/site/:id/settings',
    name: 'site-settings',
    component: () => import('../views/AddSiteView.vue'),
  },
  {
    path: '/site/:id/checklist',
    name: 'site-checklist',
    component: () => import('../views/ChecklistView.vue'),
  },
  {
    path: '/site/:id/cable-matrix',
    name: 'site-cable-matrix',
    component: () => import('../views/CableMatrixView.vue'),
  },
  {
    path: '/site/:id/antenna-checklist',
    name: 'site-antenna-checklist',
    component: () => import('../views/AntennaChecklistView.vue'),
  },
  {
    path: '/site/:id/dcpl-checklist',
    name: 'site-dcpl-checklist',
    component: () => import('../views/DcplChecklistView.vue'),
  },
  {
    path: '/site/:id/cable-checklist',
    name: 'site-cable-checklist',
    component: () => import('../views/CableChecklistView.vue'),
  },
  {
    path: '/site/:id/report/new',
    name: 'new-report',
    component: () => import('../views/NewReportView.vue'),
  },
  {
    path: '/site/:id/report/:reportId/edit',
    name: 'edit-report',
    component: () => import('../views/NewReportView.vue'),
  },
  {
    path: '/site/:id/report/:reportId/email',
    name: 'email-draft',
    component: () => import('../views/EmailDraftView.vue'),
  },
  {
    path: '/site/:id/email-settings',
    name: 'email-settings',
    component: () => import('../views/EmailSettingsView.vue'),
  },
  {
    path: '/site/:id/issue/new',
    name: 'new-issue',
    component: () => import('../views/IssueLogView.vue'),
  },
  {
    path: '/site/:id/issue/:issueId/edit',
    name: 'edit-issue',
    component: () => import('../views/IssueLogView.vue'),
  },
  {
    path: '/site/:id/confirm/new',
    name: 'new-confirm',
    component: () => import('../views/ConfirmLogView.vue'),
  },
  {
    path: '/site/:id/confirm/:confirmId/edit',
    name: 'edit-confirm',
    component: () => import('../views/ConfirmLogView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
