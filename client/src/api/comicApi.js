import { useEffect } from "react";
import useCreateResources from "../hooks/useCreateResources";
import useGetResources from "../hooks/useGetResources";

const collectionsBaseUrl = 'http://localhost:3030/data/comicsInfo';
const jsonStoreBaseUrl = 'http://localhost:3030/jsonstore/comics-rating';

export function useComics() {
    const { resource: comics, loading, fetchResource } = useGetResources();

    useEffect(() => {
        fetchResource(collectionsBaseUrl);
    }, []);

    return [loading, comics];
}

export function useComic(comicId) {
    const { resource: comic, loading, fetchResource } = useGetResources();

    useEffect(() => {
        fetchResource(`${collectionsBaseUrl}/${comicId}`);

    }, [comicId]);

    return [loading, comic];
}

export function useLatestComics(count) {
    const { resource: comics, loading, fetchResource } = useGetResources();

    useEffect(() => {
        const searchParams = new URLSearchParams({
            sortBy: '_createdOn desc',
            pageSize: `${count}`,
        });
        fetchResource(`${collectionsBaseUrl}?${searchParams.toString()}`);
    }, [count]);

    return [loading, comics];
}

export function useComicRating(ratingId) {
    if(!ratingId) return;
    const { resource: ratingData, _, fetchResource } = useGetResources();

    useEffect(() => {
        fetchResource(`${jsonStoreBaseUrl}/${ratingId}`);
    }, [ratingId]);

    return Object.values(ratingData);
}

export function usePostComicRating() {
    const { fetchResource, resource, loading, error } = useCreateResources();

    async function postRating(ratingId, votes, value) {
        const result = await fetchResource(
            'PUT',
            `${jsonStoreBaseUrl}/${ratingId}`,
            { value, votes }
        );

        return result;
    }
    return { postRating, resource, loading, error };
}