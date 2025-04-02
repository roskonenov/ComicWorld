import { useEffect, useState } from "react";
import useCreateResources from "../hooks/useCreateResources";
import useGetResources from "../hooks/useGetResources";
import { toast } from "react-toastify";
import { useUserContext } from "../contexts/UserContext";
import { useNavigate } from "react-router";

const collectionsBaseUrl = 'http://localhost:3030/data/comicsInfo';
const jsonStoreBaseUrl = 'http://localhost:3030/jsonstore/comics-rating';

export function useComics() {
    const [comics, setComics] = useState([]);
    const { fetchResource, loading, } = useGetResources();

    useEffect(() => {
        fetchResource(collectionsBaseUrl)
            .then(setComics);
    }, [fetchResource]);
    return [loading, comics];
}

export function useSelectedComics() {
    
    const {myComicsId} = useUserContext();
    const [comics, setComics] = useState([]);
    const { fetchResource, loading, } = useGetResources();

    useEffect(() => {
        if (!myComicsId || myComicsId.length === 0) return;
        const optionsData = `_id IN (${myComicsId.map(id => `"${id}"`).join(', ')})`;

        const options = new URLSearchParams({
            where: optionsData,
        });

        fetchResource(`${collectionsBaseUrl}?${options}`)
            .then(setComics)
            .catch(err => toast.error(err.message));
    }, [myComicsId, fetchResource]);
    return { loading, comics };
}

export function useComic(comicId) {
    const [comic, setComics] = useState([]);
    const { fetchResource, loading, } = useGetResources();

    useEffect(() => {
        fetchResource(`${collectionsBaseUrl}/${comicId}`)
            .then(setComics);
    }, [comicId]);
    return [loading, comic];
}

export function useLatestComics(count) {
    const [comics, setComics] = useState([]);
    const { fetchResource, loading, } = useGetResources();

    useEffect(() => {
        const searchParams = new URLSearchParams({
            sortBy: '_createdOn desc',
            pageSize: `${count}`,
        });
        fetchResource(`${collectionsBaseUrl}?${searchParams.toString()}`)
            .then(setComics);
    }, [count]);

    return [loading, comics];
}

export function useDeleteComic(){
    const { fetchResource, loading } = useCreateResources();

    async function remove(comicId) {
        
        const result = await fetchResource('DELETE', `${collectionsBaseUrl}/${comicId}`);
        
        return result
    }
    return {remove, loading};
}

export function useComicRating(ratingId) {
    const [ratingData, setRatingData] = useState({});
    const { fetchResource, loading } = useGetResources();

    useEffect(() => {
        fetchResource(`${jsonStoreBaseUrl}/${ratingId}`)
            .then(setRatingData);
    }, [ratingId]);

    return { ratingData, setRatingData, loading };
}

export function usePostComicRating() {
    const { fetchResource } = useCreateResources();

    async function postRating(ratingId, votes, value) {
        const result = await fetchResource(
            'PUT',
            `${jsonStoreBaseUrl}/${ratingId}`,
            { value, votes }
        );
        return result;
    }
    return { postRating };
}