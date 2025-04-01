import { useNavigate } from "react-router";
import { useCreateMyComics } from "../api/MyComicsApi";
import { ComicContext } from "../contexts/ComicContext";
import { useUserContext } from "../contexts/UserContext";
import usePersistedState from "../hooks/usePersistedState";
import { toast } from "react-toastify";

export default function ComicPrivider({ children }) {
    const [comic, setComic] = usePersistedState('comic', {});
    const { accessToken } = useUserContext();
    const { create } = useCreateMyComics();
    const navigate = useNavigate();

    async function buyComicHandler(comic) {
        if (!accessToken) {
            toast.warning('You must be logged in to buy comic');
            return navigate('/login');
        }

        setComic(comic);

        await create(comic._id)
            .then(() => navigate('/my-comics'))
            .catch(err => toast.error(err.message));

    }
    return (
        <ComicContext.Provider value={{ ...comic, buyComicHandler }} >
            {children}
        </ComicContext.Provider>
    );
}