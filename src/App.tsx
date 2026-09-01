import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoadingBlock } from "./components/Spinner";
import Login from "./pages/Login";
import GroupList from "./pages/GroupList";
import GroupView from "./pages/GroupView";
import AddExpense from "./pages/AddExpense";

function AppRoutes() {
  const { authenticated, loading } = useAuth();

  // The hint cookie usually lets us skip this, so it only shows on a cold start.
  if (loading && !authenticated) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <LoadingBlock label="Opening SplitEasy…" />
      </div>
    );
  }

  if (!authenticated) return <Login />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/groups" replace />} />
      <Route path="/groups" element={<GroupList />} />
      <Route path="/groups/:groupId" element={<GroupView />} />
      <Route path="/groups/:groupId/expenses/new" element={<AddExpense />} />
      <Route
        path="/groups/:groupId/expenses/:expenseId/edit"
        element={<AddExpense />}
      />
      <Route path="/groups/:groupId/:tab" element={<GroupView />} />
      <Route path="*" element={<Navigate to="/groups" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
