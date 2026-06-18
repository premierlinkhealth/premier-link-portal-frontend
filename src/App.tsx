import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Visits from "./pages/nurse/Visits";
import NurseHome from "./pages/nurse/Home";
import Assessments from "./pages/Assessments";
import AssessmentDetail from "./pages/AssessmentDetail";
import HccReference from "./pages/HccReference";
import ReviewQueue from "./pages/doctor/ReviewQueue";
import Dashboard from "./pages/admin/Dashboard";
import Patients from "./pages/admin/Patients";
import PatientForm from "./pages/admin/PatientForm";
import BulkUpload from "./pages/admin/BulkUpload";
import PatientDetail from "./pages/PatientDetail";
import Scheduling from "./pages/admin/Scheduling";
import ManageNurses from "./pages/admin/ManageNurses";
import Settings from "./pages/admin/Settings";
import Users from "./pages/admin/Users";
import Account from "./pages/nurse/Account";

export default function App() {
  const { loading, fbUser, profile, error } = useAuth();

  if (loading) return <div className="center-note">Loading…</div>;
  if (!fbUser) return <Login />;
  if (error) return <div className="center-note">{error}<br /><br />Your sign-in worked, but your staff account isn’t set up yet. Contact an administrator.</div>;
  if (!profile) return <div className="center-note">Loading your account…</div>;

  const home =
    profile.role === "nurse" ? "/home" : profile.role === "doctor" ? "/review" : "/dashboard";

  return (
    <Layout>
      <Routes>
        {/* shared */}
        <Route path="/assessments/:id" element={<AssessmentDetail />} />
        <Route path="/patients/:id" element={<PatientDetail />} />
        <Route path="/hcc-reference" element={<HccReference />} />

        {profile.role === "nurse" && (
          <>
            <Route path="/home" element={<NurseHome />} />
            <Route path="/visits" element={<Visits />} />
            <Route path="/assessments" element={<Assessments scope="mine" />} />
            <Route path="/account" element={<Account />} />
          </>
        )}

        {profile.role === "doctor" && <Route path="/review" element={<ReviewQueue />} />}

        {profile.role === "admin" && (
          <>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/patients/new" element={<PatientForm mode="new" />} />
            <Route path="/patients/bulk" element={<BulkUpload />} />
            <Route path="/patients/:id/edit" element={<PatientForm mode="edit" />} />
            <Route path="/scheduling" element={<Scheduling />} />
            <Route path="/nurses" element={<ManageNurses />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/users" element={<Users />} />
            <Route path="/assessments" element={<Assessments scope="all" />} />
          </>
        )}

        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  );
}
