import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Visits from "./pages/nurse/Visits";
import Assessments from "./pages/Assessments";
import AssessmentDetail from "./pages/AssessmentDetail";
import ReviewQueue from "./pages/doctor/ReviewQueue";
import Dashboard from "./pages/admin/Dashboard";
import Patients from "./pages/admin/Patients";
import Scheduling from "./pages/admin/Scheduling";
import Users from "./pages/admin/Users";

export default function App() {
  const { loading, fbUser, profile, error } = useAuth();

  if (loading) return <div className="center-note">Loading…</div>;
  if (!fbUser) return <Login />;
  if (error) return <div className="center-note">{error}<br /><br />Your sign-in worked, but your staff account isn’t set up yet. Contact an administrator.</div>;
  if (!profile) return <div className="center-note">Loading your account…</div>;

  const home =
    profile.role === "nurse" ? "/visits" : profile.role === "doctor" ? "/review" : "/dashboard";

  return (
    <Layout>
      <Routes>
        {/* shared */}
        <Route path="/assessments/:id" element={<AssessmentDetail />} />

        {profile.role === "nurse" && (
          <>
            <Route path="/visits" element={<Visits />} />
            <Route path="/assessments" element={<Assessments scope="mine" />} />
          </>
        )}

        {profile.role === "doctor" && <Route path="/review" element={<ReviewQueue />} />}

        {profile.role === "admin" && (
          <>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/scheduling" element={<Scheduling />} />
            <Route path="/users" element={<Users />} />
            <Route path="/assessments" element={<Assessments scope="all" />} />
          </>
        )}

        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  );
}
