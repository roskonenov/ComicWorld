import { useEffect, useState } from "react";
import useCreateResources from "../hooks/useCreateResources";
import useGetResources from "../hooks/useGetResources";

const collectionsBaseUrl = 'http://localhost:3030/data/comicsInfo';
const jsonStoreBaseUrl = 'http://localhost:3030/jsonstore/comics-rating';

export function useComics() {
    const [comics, setComics] = useState([]);
    const { fetchResource, loading, } = useGetResources();

    useEffect(() => {
        fetchResource(collectionsBaseUrl)
            .then(setComics);
    }, []);
    return [loading, comics];
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

export function useComicRating(ratingId) {
    const [ratingData, setRatingData] = useState({});
    const { fetchResource } = useGetResources();

    useEffect(() => {
        fetchResource(`${jsonStoreBaseUrl}/${ratingId}`)
        .then(setRatingData);
    }, [ratingId]);

    return Object.values(ratingData);
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