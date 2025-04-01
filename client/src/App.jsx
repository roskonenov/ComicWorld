import BackgroundVideo from "./components/background/BackgroundVideo"
import Header from "./components/header/Header"
import Home from "./components/home/Home"
import ComicsList from "./components/comicsList/ComicsList"
import ComicDetails from "./components/comic-details/ComicDetails"
import LoginRegister from "./components/login-register/LoginRegister"
import Logout from "./components/logout/Logout"

import { Route, Routes } from "react-router"
import UserProvider from "./providers/UserProvider"
import AuthGuard from "./components/guards/AuthenticationGuard"
import GuestGuard from "./components/guards/GuestGuard"
import ErrorBoundry from "./components/error-boundary/ErrorBoundary"

function App() {

  return (
    <UserProvider >
      <BackgroundVideo />
      <Header />
      <ErrorBoundry>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/catalog" element={<ComicsList />} />
          <Route element={<AuthGuard />}>
            <Route path="/logout" element={<Logout />} />
          </Route>
          <Route element={<GuestGuard />}>
            <Route path="/login" element={<LoginRegister />} />
            <Route path="/register" element={<LoginRegister />} />
          </Route>
          <Route path="/catalog/:comicId" element={<ComicDetails />} />
        </Routes>
      </ErrorBoundry>
    </UserProvider>
  )
}

export default App
