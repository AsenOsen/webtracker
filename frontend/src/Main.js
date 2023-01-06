import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const Form = () => {
    return (
        <form className="ui form" method="POST" action="add">
            <div className="ui fluid field">
                <label>Add URL</label>
                <input type="text" name="url"/>
            </div>
            <button className="ui fluid button" type="submit">Add URL</button>
        </form>
    )
}

const Delete = (key) => {
    fetch("/del/" + key)
        .then((res) => res.text())
        .then((text) => alert(text))
}

const Table = () => {
    const [urls, setUrls] = useState({});
    useEffect(() => {
        fetch("/urls").then(res => res.json()).then((res) => setUrls(res));
    }, []);
    return (
        <table className="ui table" border="1">
            <tbody>
            { Object.entries(urls).map(([key, url]) => (
                <tr key={key}>
                    <td><a href={url} target="_blank">{url.substr(0,40)}...</a></td>
                    <td><Link to={"/view/" + key}>View</Link></td>
                    <td><button onClick={() => Delete(key)}>Delete</button></td>
                </tr>
            ))}
            </tbody>
        </table>
    );
}

const Main = () => {
    return (
        <div className="ui one column container">
            <div className="column">
                <Form/>
                <Table/>
            </div>
        </div>    
    )
}

export default Main;