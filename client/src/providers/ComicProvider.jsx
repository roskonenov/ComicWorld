import { useNavigate } from "react-router";
import { useCreateMyComics } from "../api/MyComicsApi";
import { ComicContext } from "../contexts/ComicContext";
import { useUserContext } from "../contexts/UserContext";
import { toast } from "react-toastify";
import usePersistedState from "../hooks/usePersistedState";

export default function ComicPrivider({ children }) {
    const { accessToken, setMyComicsId } = useUserContext();
    const { create } = useCreateMyComics();
    const navigate = useNavigate();
    const [comic, setComic] = usePersistedState('comic', {});

    async function buyComicHandler(comic) {
        if (!accessToken) {
            toast.warning('You must be logged in to buy comic');
            return navigate('/login');
        }

        await create(comic._id)
            .then(result => {
                setMyComicsId(m => [...m, result.myComicId]);
                navigate('/my-comics');
                toast.success(`You successfuly bought "${comic.title}"`)
            })
            .catch(err => toast.error(err.message));
    }

    function readComicHandler(comic) {
        setComic(comic);
        return navigate(`/read/${comic._id}`);
    }

    return (
        <ComicContext.Provider value={{comic, buyComicHandler, readComicHandler }} >
            {children}
        </ComicContext.Provider>
    );
}