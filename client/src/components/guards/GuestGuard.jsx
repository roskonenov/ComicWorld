import { Navigate, Outlet } from "react-router";
import { useUserContext } from "../../contexts/UserContext";

export default function GuestGuard() {
    const { accessToken } = useUserContext();

    if (accessToken) {
        return <Navigate to={'/'} />
    }
    return <Outlet />
}