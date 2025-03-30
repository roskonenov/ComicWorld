import { Navigate } from "react-router";
import { useLogout } from "../../api/authenticationApi";
import Spinner from "../spinner/Spinner";

export default function Logout() {
    const { isLogout, loading } = useLogout();
    return isLogout || !loading
        ? <Navigate to={"/"} />
        : <Spinner />
}