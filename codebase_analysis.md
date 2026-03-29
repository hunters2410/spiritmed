# Spiritmed Hospital Management System - Codebase Analysis

## 1. Project Overview
Spiritmed is a comprehensive Hospital Management System (HMS) designed to handle multi-branch operations. It covers clinical workflows, patient management, billing, inventory, and staff management.

## 2. Technology Stack
- **Frontend**: React (v18.3), TypeScript, Vite
- **Styling**: Tailwind CSS, Lucide React (for icons)
- **Database & Auth**: Supabase (PostgreSQL, Supabase Auth)
- **Visualization**: Recharts
- **PDF Generation**: jsPDF, html2canvas

## 3. Architecture & Design Patterns
- **Routing**: Custom implementation in `App.tsx` using `window.location.pathname` and `popstate`. It does not use `react-router-dom`.
- **State Management**: React `useState` and `useEffect`. Authentication and user profiles are managed via `AuthContext`.
- **Layout**: A centralized `Layout` component handles the sidebar, header, theme toggling (light/dark mode), and quick actions.
- **Data Fetching**: Primarily direct calls to Supabase within each page component.

## 4. Key Modules Implemented
- **Patient Management**: Registration, archiving, tracking (active/discharged/deceased).
- **Clinical Workflow**: Consultations, vital signs, prescriptions, lab results, histology.
- **Appointments**: Calendar view, schedule management, online booking.
- **Financial Control**: Invoicing, payments, accounts management.
- **Inventory & Pharmacy**: Stock tracking, transactions, medicine frequency setup.
- **Staff Management**: User roles, attendance, leave management, payroll, HR.
- **Administration**: Branch management, system settings, audit logs.

## 5. Observations & Recommendations

### Architecture
- **Monolithic Components**: Some page components (e.g., `Consultations.tsx`, `Patients.tsx`) are extremely large (over 1000 lines). 
  - *Recommendation*: Refactor these into smaller, modular components and move business logic into custom hooks.
- **Custom Routing**: The manual routing logic in `App.tsx` is functional but lacks standard features like nested routes, route guards, and easy parameter handling.
  - *Recommendation*: Consider migrating to `react-router-dom` for better maintainability and feature set.
- **DRY (Don't Repeat Yourself)**: Data fetching logic (e.g., loading doctors, branches, etc.) is duplicated across multiple pages.
  - *Recommendation*: Create shared utility functions or custom hooks for common data fetching tasks.

### User Experience
- **Theme Support**: The manual implementation of dark mode is robust, using `localStorage` and CSS classes.
- **Quick Actions**: The "Quick Action" search in the header is a great productivity feature for navigating a complex system.
- **Global Search**: High-level search capability is integrated into the header.

### Engineering Health
- **Type Safety**: Good use of TypeScript interfaces for data models.
- **Database Schema**: The consolidated schema script shows a well-normalized database structure with foreign key constraints.
- **Security**: Role-based access control (RBAC) is implemented on the frontend via the `Layout` and page-level role checks.
  - *Note*: Ensure that Supabase Row Level Security (RLS) is also properly configured on the backend.

## 6. Conclusion
The Spiritmed codebase is a feature-rich and well-structured application. While the frontend architecture relies on some manual patterns (routing, monolithic pages), the clear modularization of features into separate files and the solid database foundation make it a very capable system. Scaling the application further would benefit from component refactoring and standardized routing.
