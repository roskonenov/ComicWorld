import { useUserContext } from "../../contexts/UserContext";
import { Navigate, Outlet } from 'react-router'

export default function AuthGuard() {
    const { accessToken } = useUserContext();

    if (!accessToken) {
        return <Navigate to='/login' />
    }

    return <Outlet />
}